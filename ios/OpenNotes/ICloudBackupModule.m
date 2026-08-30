#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(ICloudBackupModule, NSObject)

RCT_EXTERN_METHOD(getContainerPath:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(copyItem:(NSString *)from
                  to:(NSString *)to
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(writeFileAtomic:(NSString *)path
                  contents:(NSString *)contents
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(readFileAsString:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(deleteItem:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(listFilesRecursive:(NSString *)dir
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(ensureDownloaded:(NSString *)path
                  timeoutMs:(nonnull NSNumber *)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(uploadStatus:(NSString *)dir
                  timeoutMs:(nonnull NSNumber *)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

RCT_EXTERN_METHOD(listCloudFiles:(NSString *)dir
                  timeoutMs:(nonnull NSNumber *)timeoutMs
                  resolver:(RCTPromiseResolveBlock)resolver
                  rejecter:(RCTPromiseRejectBlock)rejecter)

@end
