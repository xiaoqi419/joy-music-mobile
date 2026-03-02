# iOS 自签发包发布教程（自动发包 + Tag + Release 联动）

本文档基于当前仓库配置，目标是实现下面这条闭环：

`输入版本号 -> 自动更新版本文件 -> 自动打 tag -> 自动构建 unsigned IPA -> 自动上传 GitHub Release -> App 内检查更新可识别新版本`

## 1. 当前发布链路

仓库内已配置两个工作流：

1. `.github/workflows/release-tag.yml`  
   手动输入版本号，自动完成：
   - 同步版本文件
   - 提交版本变更
   - 创建并推送 `v<version>` tag

2. `.github/workflows/ios-unsigned-ipa.yml`  
   被 tag 触发，自动完成：
   - 构建 unsigned IPA
   - 上传 Actions Artifact
   - 上传到对应 GitHub Release（可自动判断 prerelease）

## 2. 版本来源与联动规则

发布时会统一更新这 3 处版本号：

1. `package.json` -> `version`
2. `app.json` -> `expo.version` 和 `expo.ios.buildNumber`
3. `src/config/index.ts` -> `appConfig.version`

对应的自动脚本是：

```bash
npm run release:version -- 1.2.3
```

应用内检查更新逻辑：

1. 当前版本来自 `appConfig.version`
2. 远端版本来自 `GitHub Releases latest`
3. tag 里会提取 `x.y.z` 做比较（例如 `v1.2.3`、`ios-v1.2.3`、`v1.2.3-beta.1` 都可提取）

## 3. 推荐发布流程（自动）

### Step 1：触发 Release Tag

1. 打开 GitHub 仓库 -> `Actions` -> `Release Tag`
2. 点击 `Run workflow`
3. 输入版本号（示例：`1.0.1` 或 `1.0.1-beta.1`）
4. 运行后会自动创建 tag：`v<version>`

### Step 2：等待 iOS Unsigned IPA 自动触发

`iOS Unsigned IPA` 会在推送 tag 后自动运行（支持 `v*` 和 `ios-v*`）。

成功后会生成：

1. Artifact：`JoyMusicMobile-<version>-unsigned.ipa`
2. Release Asset：同名 IPA 文件

### Step 3：验证 Release 与应用内版本

1. 在 GitHub `Releases` 确认新版本与 IPA 已上传
2. App 内点击“检查更新”，应能读取到最新版本信息

## 4. 手动发布流程（Fallback）

当你不走 `Release Tag` 工作流时，可本地手动发布：

```bash
# 1) 同步版本文件
npm run release:version -- 1.0.2

# 2) 提交版本变更
git add package.json app.json src/config/index.ts
git commit -m "🔖 chore(release): 发布 v1.0.2"

# 3) 打 tag 并推送
git tag -a v1.0.2 -m "release: v1.0.2"
git push origin master
git push origin v1.0.2
```

推送 tag 后，`iOS Unsigned IPA` 仍会自动触发发包。

## 5. 手动触发发包（不打 tag）

如只想临时打包，不改版本：

1. 进入 `Actions` -> `iOS Unsigned IPA` -> `Run workflow`
2. 若需要上传 Release：
   - `upload_release = true`
   - `release_tag = v1.0.2`（必须存在或可由 action-gh-release 自动创建）

## 6. 常见问题排查

### 1) `No release found. Please publish a GitHub Release first.`

说明该仓库还没有可识别的 Release。  
先确保至少发布过一次 `v<semver>` 版本。

### 2) `Invalid latest version tag`

说明 latest release 的 tag 不符合预期。  
建议统一使用：`v1.2.3` 或 `v1.2.3-beta.1`。

### 3) App 显示“已是最新版本”，但你刚发了 beta

GitHub `releases/latest` 默认返回稳定版，不一定返回 prerelease。  
如果要让 App 内默认检测到新版本，优先发布稳定 tag（不带 `-beta`）。

### 4) `Tag vX.Y.Z already exists on remote`

同版本 tag 已存在，需改新版本号重新发布。

## 7. 发布前检查清单

1. 版本号是否符合语义化（`x.y.z` 或 `x.y.z-beta.n`）
2. `release-tag` 工作流是否成功创建 `v<version>` tag
3. `ios-unsigned-ipa` 工作流是否成功上传 IPA
4. `Releases` 页面是否可下载 IPA
5. App 内“检查更新”是否能看到版本变化

