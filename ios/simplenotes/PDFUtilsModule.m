#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(PDFUtilsModule, NSObject)

RCT_EXTERN_METHOD(getPageCount:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(copySecurityScopedFileToTmp:(NSString *)sourceUrl
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(getPageCountFromBase64:(NSString *)base64Data
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
