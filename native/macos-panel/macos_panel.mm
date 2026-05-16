#include <node_api.h>
#include <string.h>

#import <Cocoa/Cocoa.h>

namespace {

void* PointerFromBuffer(napi_env env, napi_value value) {
  bool isBuffer = false;
  if (napi_is_buffer(env, value, &isBuffer) != napi_ok || !isBuffer) {
    napi_throw_type_error(env, nullptr, "Expected a native window handle Buffer");
    return nullptr;
  }

  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok || length < sizeof(void*)) {
    napi_throw_type_error(env, nullptr, "Invalid native window handle Buffer");
    return nullptr;
  }

  void* pointer = nullptr;
  memcpy(&pointer, data, sizeof(void*));
  return pointer;
}

NSWindow* WindowFromNativeHandle(void* pointer) {
  if (!pointer) return nil;

  id object = (__bridge id)pointer;
  if ([object isKindOfClass:[NSWindow class]]) {
    return (NSWindow*)object;
  }
  if ([object respondsToSelector:@selector(window)]) {
    return [object window];
  }
  return nil;
}

void SetPreventsActivation(NSWindow* window, BOOL preventsActivation) {
  SEL selector = NSSelectorFromString(@"_setPreventsActivation:");
  if (![window respondsToSelector:selector]) return;

  IMP implementation = [window methodForSelector:selector];
  if (!implementation) return;

  using SetPreventsActivationFn = void (*)(id, SEL, BOOL);
  reinterpret_cast<SetPreventsActivationFn>(implementation)(window, selector, preventsActivation);
}

BOOL ConfigureWindow(NSWindow* window) {
  if (!window) return NO;

  NSRect stableFrame = [window frame];
  NSWindowStyleMask styleMask = [window styleMask];
  NSWindowStyleMask nonActivatingStyleMask = styleMask | NSWindowStyleMaskNonactivatingPanel;
  if (styleMask != nonActivatingStyleMask) {
    [window setStyleMask:nonActivatingStyleMask];
  }

  SetPreventsActivation(window, YES);

  NSWindowCollectionBehavior behavior = [window collectionBehavior];
  behavior |= NSWindowCollectionBehaviorCanJoinAllSpaces;
  behavior |= NSWindowCollectionBehaviorFullScreenAuxiliary;
  behavior |= NSWindowCollectionBehaviorTransient;
  [window setCollectionBehavior:behavior];

  [window setHidesOnDeactivate:NO];

  if (!NSEqualRects([window frame], stableFrame)) {
    [window setFrame:stableFrame display:NO animate:NO];
  }

  return YES;
}

BOOL HideWindow(NSWindow* window) {
  if (!window) return NO;

  NSRect stableFrame = [window frame];
  [NSAnimationContext beginGrouping];
  [[NSAnimationContext currentContext] setDuration:0.0];
  [[NSAnimationContext currentContext] setAllowsImplicitAnimation:NO];
  [window orderOut:nil];
  [NSAnimationContext endGrouping];

  if (!NSEqualRects([window frame], stableFrame)) {
    [window setFrame:stableFrame display:NO animate:NO];
  }

  return YES;
}

BOOL ShowWindow(NSWindow* window) {
  if (!window) return NO;

  ConfigureWindow(window);

  if ([window isMiniaturized]) {
    [window deminiaturize:nil];
  }

  [window orderFrontRegardless];
  if ([window canBecomeKeyWindow]) {
    [window makeKeyWindow];
  }

  return YES;
}

BOOL IsWindowFrontmost(NSWindow* window) {
  if (!window || ![window isVisible]) return NO;
  if ([window isKeyWindow]) return YES;
  return [window orderedIndex] == 0;
}

BOOL SetWindowPinned(NSWindow* window, BOOL pinned) {
  if (!window) return NO;

  ConfigureWindow(window);
  [window setLevel:pinned ? NSStatusWindowLevel : NSNormalWindowLevel];
  return YES;
}

napi_value RunWindowAction(
  napi_env env,
  napi_callback_info info,
  const char* errorMessage,
  BOOL (^action)(NSWindow* window)
) {
  size_t argc = 1;
  napi_value args[1];
  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc < 1) {
    napi_throw_type_error(env, nullptr, errorMessage);
    return nullptr;
  }

  void* pointer = PointerFromBuffer(env, args[0]);
  if (!pointer) return nullptr;

  __block BOOL ok = NO;
  void (^actionBlock)(void) = ^{
    @autoreleasepool {
      ok = action(WindowFromNativeHandle(pointer));
    }
  };

  if ([NSThread isMainThread]) {
    actionBlock();
  } else {
    dispatch_sync(dispatch_get_main_queue(), actionBlock);
  }

  napi_value result;
  napi_get_boolean(env, ok, &result);
  return result;
}

napi_value RunWindowBooleanAction(
  napi_env env,
  napi_callback_info info,
  const char* errorMessage,
  BOOL (^action)(NSWindow* window, BOOL value)
) {
  size_t argc = 2;
  napi_value args[2];
  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok || argc < 2) {
    napi_throw_type_error(env, nullptr, errorMessage);
    return nullptr;
  }

  void* pointer = PointerFromBuffer(env, args[0]);
  if (!pointer) return nullptr;

  bool value = false;
  if (napi_get_value_bool(env, args[1], &value) != napi_ok) {
    napi_throw_type_error(env, nullptr, "Expected a boolean argument");
    return nullptr;
  }

  __block BOOL ok = NO;
  void (^actionBlock)(void) = ^{
    @autoreleasepool {
      ok = action(WindowFromNativeHandle(pointer), value ? YES : NO);
    }
  };

  if ([NSThread isMainThread]) {
    actionBlock();
  } else {
    dispatch_sync(dispatch_get_main_queue(), actionBlock);
  }

  napi_value result;
  napi_get_boolean(env, ok, &result);
  return result;
}

napi_value ConfigureNonActivatingPanel(napi_env env, napi_callback_info info) {
  return RunWindowAction(
    env,
    info,
    "configureNonActivatingPanel requires a native window handle",
    ^BOOL(NSWindow* window) {
      return ConfigureWindow(window);
    }
  );
}

napi_value ShowNonActivatingPanel(napi_env env, napi_callback_info info) {
  return RunWindowAction(
    env,
    info,
    "showNonActivatingPanel requires a native window handle",
    ^BOOL(NSWindow* window) {
      return ShowWindow(window);
    }
  );
}

napi_value HideNonActivatingPanel(napi_env env, napi_callback_info info) {
  return RunWindowAction(
    env,
    info,
    "hideNonActivatingPanel requires a native window handle",
    ^BOOL(NSWindow* window) {
      return HideWindow(window);
    }
  );
}

napi_value IsNonActivatingPanelFrontmost(napi_env env, napi_callback_info info) {
  return RunWindowAction(
    env,
    info,
    "isNonActivatingPanelFrontmost requires a native window handle",
    ^BOOL(NSWindow* window) {
      return IsWindowFrontmost(window);
    }
  );
}

napi_value SetNonActivatingPanelPinned(napi_env env, napi_callback_info info) {
  return RunWindowBooleanAction(
    env,
    info,
    "setNonActivatingPanelPinned requires a native window handle and pinned boolean",
    ^BOOL(NSWindow* window, BOOL pinned) {
      return SetWindowPinned(window, pinned);
    }
  );
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {
    {
      "configureNonActivatingPanel",
      nullptr,
      ConfigureNonActivatingPanel,
      nullptr,
      nullptr,
      nullptr,
      napi_default,
      nullptr,
    },
    {
      "showNonActivatingPanel",
      nullptr,
      ShowNonActivatingPanel,
      nullptr,
      nullptr,
      nullptr,
      napi_default,
      nullptr,
    },
    {
      "hideNonActivatingPanel",
      nullptr,
      HideNonActivatingPanel,
      nullptr,
      nullptr,
      nullptr,
      napi_default,
      nullptr,
    },
    {
      "isNonActivatingPanelFrontmost",
      nullptr,
      IsNonActivatingPanelFrontmost,
      nullptr,
      nullptr,
      nullptr,
      napi_default,
      nullptr,
    },
    {
      "setNonActivatingPanelPinned",
      nullptr,
      SetNonActivatingPanelPinned,
      nullptr,
      nullptr,
      nullptr,
      napi_default,
      nullptr,
    },
  };

  napi_define_properties(env, exports, 5, descriptors);
  return exports;
}

} // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
