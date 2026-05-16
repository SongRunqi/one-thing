{
  "targets": [
    {
      "target_name": "macos_panel",
      "sources": ["macos_panel.mm"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "11.0",
            "OTHER_LDFLAGS": ["-framework", "Cocoa"]
          }
        }]
      ]
    }
  ]
}
