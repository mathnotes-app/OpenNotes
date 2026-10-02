package com.builderpro.opennotes

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.util.UUID

@ReactModule(name = PDFUtilsModule.NAME)
class PDFUtilsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "PDFUtilsModule"
    }

    override fun getName() = NAME

    @ReactMethod
    fun getPageCount(filePath: String, promise: Promise) {
        try {
            val pageCount = when {
                filePath.startsWith("content://") -> getPageCountFromContentUri(filePath)
                filePath.startsWith("file://") -> getPageCountFromFile(File(filePath.removePrefix("file://")))
                filePath.startsWith("/") -> getPageCountFromFile(File(filePath))
                else -> {
                    promise.reject("E_INVALID_PATH", "Unsupported file path format: $filePath")
                    return
                }
            }

            if (pageCount != null) {
                promise.resolve(pageCount)
            } else {
                promise.reject("E_INVALID_PDF", "Failed to parse PDF document")
            }
        } catch (e: Exception) {
            promise.reject("E_PDF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getPageCountFromBase64(base64Data: String, promise: Promise) {
        try {
            val cleanBase64 = if (base64Data.contains("base64,")) {
                base64Data.substringAfter("base64,")
            } else {
                base64Data
            }
            val pdfBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
            val tempFile = File.createTempFile("pdf_pagecount_", ".pdf", reactContext.cacheDir)
            try {
                tempFile.writeBytes(pdfBytes)
                val pageCount = getPageCountFromFile(tempFile)
                if (pageCount != null) {
                    promise.resolve(pageCount)
                } else {
                    promise.reject("E_INVALID_PDF", "Failed to parse PDF document")
                }
            } finally {
                tempFile.delete()
            }
        } catch (e: Exception) {
            promise.reject("E_PDF_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun copySecurityScopedFileToTmp(sourceUrl: String, promise: Promise) {
        try {
            val destFile = copySourceToTempFile(sourceUrl)
            promise.resolve("file://${destFile.absolutePath}")
        } catch (e: Exception) {
            promise.reject("E_COPY_FAILED", e.message, e)
        }
    }

    /**
     * Concatenates PDFs into one new cache file and resolves its file:// URI.
     * Android has no vector PDF merge API, so each page is rendered at 2x and
     * written into a new document one page at a time to keep memory bounded.
     */
    @ReactMethod
    fun mergePdfFiles(fileUris: ReadableArray, promise: Promise) {
        if (fileUris.size() == 0) {
            promise.reject("E_NO_INPUT", "No PDF files to merge")
            return
        }
        val exportDir = File(reactContext.cacheDir, "pdf-export")
        val destination = File(exportDir, "${UUID.randomUUID()}.pdf")
        val output = PdfDocument()
        try {
            // Earlier exports have been shared already; don't let them pile up.
            exportDir.listFiles()?.forEach { it.delete() }
            exportDir.mkdirs()
            var outputPageNumber = 1
            for (index in 0 until fileUris.size()) {
                val uri = fileUris.getString(index)
                    ?: throw IOException("Missing PDF file URL at position $index")
                val source = localFileFor(uri) ?: throw IOException("Invalid PDF file URL: $uri")
                if (!source.exists()) throw IOException("Could not read ${source.name}")
                ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
                    PdfRenderer(pfd).use { renderer ->
                        for (pageIndex in 0 until renderer.pageCount) {
                            renderer.openPage(pageIndex).use { page ->
                                copyPage(page, output, outputPageNumber)
                            }
                            outputPageNumber += 1
                        }
                    }
                }
            }
            FileOutputStream(destination).use { output.writeTo(it) }
            promise.resolve("file://${destination.absolutePath}")
        } catch (e: Exception) {
            destination.delete()
            promise.reject("E_MERGE_FAILED", e.message ?: "Could not merge PDF files", e)
        } finally {
            output.close()
        }
    }

    private fun copyPage(page: PdfRenderer.Page, output: PdfDocument, pageNumber: Int) {
        val scale = 2
        val bitmap = Bitmap.createBitmap(page.width * scale, page.height * scale, Bitmap.Config.ARGB_8888)
        try {
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
            val info = PdfDocument.PageInfo.Builder(page.width, page.height, pageNumber).create()
            val outputPage = output.startPage(info)
            outputPage.canvas.drawBitmap(bitmap, null, Rect(0, 0, page.width, page.height), null)
            output.finishPage(outputPage)
        } finally {
            bitmap.recycle()
        }
    }

    private fun getPageCountFromFile(file: File): Int? {
        if (!file.exists()) return null
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        try {
            val renderer = PdfRenderer(pfd)
            try {
                return renderer.pageCount
            } finally {
                renderer.close()
            }
        } finally {
            pfd.close()
        }
    }

    private fun getPageCountFromContentUri(uriString: String): Int? {
        val uri = Uri.parse(uriString)
        val pfd = reactContext.contentResolver.openFileDescriptor(uri, "r") ?: return null
        try {
            val renderer = PdfRenderer(pfd)
            try {
                return renderer.pageCount
            } finally {
                renderer.close()
            }
        } finally {
            pfd.close()
        }
    }

    /** A local file for a file:// URI (percent-decoded) or a plain absolute path. */
    private fun localFileFor(uri: String): File? = when {
        uri.startsWith("file://") -> File(Uri.parse(uri).path ?: uri.removePrefix("file://"))
        uri.startsWith("/") -> File(uri)
        else -> null
    }

    private fun copySourceToTempFile(sourceUrl: String): File {
        val importDir = File(reactContext.cacheDir, "pdf-import")
        if (!importDir.exists() && !importDir.mkdirs()) {
            throw IOException("Could not create PDF import directory")
        }

        val extension = extensionForSource(sourceUrl)
        val destFile = File(importDir, "${UUID.randomUUID()}.$extension")

        val inputStream = when {
            sourceUrl.startsWith("content://") -> {
                reactContext.contentResolver.openInputStream(Uri.parse(sourceUrl))
                    ?: throw IOException("Could not open content URI")
            }
            else -> FileInputStream(
                localFileFor(sourceUrl) ?: throw IOException("Unsupported file path format: $sourceUrl"),
            )
        }

        inputStream.use { input ->
            FileOutputStream(destFile).use { output ->
                input.copyTo(output)
            }
        }

        if (!destFile.exists() || destFile.length() <= 0L) {
            throw IOException("Copied PDF is empty")
        }

        return destFile
    }

    private fun extensionForSource(sourceUrl: String): String {
        val lastSegment = try {
            Uri.parse(sourceUrl).lastPathSegment ?: sourceUrl
        } catch (_: Exception) {
            sourceUrl
        }
        val extension = lastSegment.substringAfterLast('.', "pdf")
        if (extension.isBlank() || extension.length > 8 || extension.contains('/')) {
            return "pdf"
        }
        return extension.lowercase()
    }
}
