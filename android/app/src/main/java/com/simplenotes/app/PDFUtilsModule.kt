package com.simplenotes.app

import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.util.Base64
import com.facebook.react.bridge.Promise
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
            sourceUrl.startsWith("file://") -> {
                val path = Uri.parse(sourceUrl).path ?: sourceUrl.removePrefix("file://")
                FileInputStream(File(path))
            }
            sourceUrl.startsWith("/") -> FileInputStream(File(sourceUrl))
            else -> throw IOException("Unsupported file path format: $sourceUrl")
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
