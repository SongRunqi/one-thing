# WeChat iLink Official Package Snapshot

Source package: `@tencent-weixin/openclaw-weixin`

Version: `2.4.6`

Author: `Tencent`

Pulled from npm registry tarball:

`https://registry.npmjs.org/@tencent-weixin/openclaw-weixin/-/openclaw-weixin-2.4.6.tgz`

Integrity:

`sha512-qw9k3PLTiMWGNjjsknHgcTManH1w4j+Ji1ArWIaYLKCq3aFRsVwcqnPi127bvOoVMJGW4dbyJ8NECEMgoO+iRw==`

## Included Files

- `README.zh_CN.md`: Chinese official package README.
- `README.md`: English official package README.
- `CHANGELOG.zh_CN.md`: Chinese changelog.
- `CHANGELOG.md`: English changelog.
- `LICENSE`: Package license.
- `package.json`: Official package metadata.
- `tencent-weixin-openclaw-weixin-2.4.6.tgz`: Original npm package tarball.
- `src/api/`: iLink request/response types and HTTP wrappers.
- `src/auth/`: QR login and account persistence implementation.
- `src/monitor/`: Long-polling loop.
- `src/messaging/`: Inbound/outbound message handling.

## Protocol Notes

- `src/api/types.ts` defines `GetUpdatesResp.ret` as optional and also includes optional `sync_buf`, `errcode`, `errmsg`, `msgs`, `get_updates_buf`, and `longpolling_timeout_ms`.
- `README.zh_CN.md` still documents `ret: 0` in the example response, but the package source is more permissive and matches observed server responses where `ret` may be absent.
- `src/api/api.ts` adds `base_info` to POST bodies, including `channel_version` and `bot_agent`.
- Official headers include `Content-Type`, `AuthorizationType`, `X-WECHAT-UIN`, `Authorization` when token is available, plus `iLink-App-Id` and `iLink-App-ClientVersion`.
- `src/monitor/monitor.ts` persists `get_updates_buf` and resumes from the previous cursor.
