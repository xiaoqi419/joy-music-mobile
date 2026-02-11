# Joy Music Mobile Expo 快速开始指南

## 📋 前置要求

确保您的电脑已安装以下软件：

- **Node.js** >= 18.0.0 ([下载](https://nodejs.org/))
- **npm** >= 8.5.2 (Node.js 自带)
- **Expo CLI** (通过 npm 安装)

**注意**: 使用 Expo，您无需 Xcode 或 macOS！

## 🚀 快速开始 (3 步)

### 1️⃣ 克隆或进入项目

```bash
cd "e:\project\Joy Music\JoyMusicMobile"
# 或在您的终端中导航到项目目录
```

### 2️⃣ 安装依赖

```bash
# 安装 npm 依赖
npm install

# 全局安装 Expo CLI（如果还未安装）
npm install -g expo-cli
```

### 3️⃣ 运行应用

```bash
# 启动 Expo 开发服务器
npm start

# 然后按照屏幕提示：
# - 按 'i' 在 iOS 模拟器中打开 (需要 macOS)
# - 按 'a' 在 Android 模拟器中打开
# - 按 'w' 在网页浏览器中打开
# - 使用 Expo Go 应用扫描二维码在真实设备上运行
```

## 📱 在真实 iOS 设备上运行（推荐！）

### 最简单方法: 使用 Expo Go 应用

1. 在您的 iPhone 上从 App Store 安装 **Expo Go**
2. 运行 `npm start`
3. 用 iPhone 的相机扫描终端中显示的二维码
4. 应用将在 Expo Go 中自动启动！

### 使用 Tunnel（不在同一网络）

```bash
npm run tunnel
```

然后用 iPhone 扫描二维码即可运行。

## 📁 项目文件夹说明

| 文件夹 | 说明 |
|--------|------|
| `src/` | 源代码目录 (JavaScript/TypeScript) |
| `assets/` | 图标和启动屏幕资源 |
| `node_modules/` | 依赖包（自动生成）|
| `.git/` | Git 仓库 |

## 🛠️ 常用命令

```bash
# 启动开发服务器
npm start

# 在网页浏览器中运行
npm run web

# 代码检查
npm run lint

# 自动修复代码格式问题
npm run lint:fix

# 运行测试
npm test
```

## 🎯 为什么选择 Expo？

✅ **无需 Xcode/macOS** - 在 Windows 上完全可用
✅ **Expo Go 应用** - 直接在真实 iPhone 上测试
✅ **热重载** - 修改代码立即在设备上看到变化
✅ **内置工具** - 无需复杂的原生配置
✅ **云构建** - 可以通过云生成 IPA（上传到 App Store）
✅ **跨平台** - 代码在 iOS、Android 和 Web 上共享

## 🔍 调试

### 查看日志

```bash
# Expo 会在终端显示所有日志
npm start
```

### 在真实设备上使用开发菜单

摇动您的 iPhone 两次以打开开发菜单，您可以：
- 看到性能统计
- 启用/禁用远程调试
- 拍摄屏幕截图
- 使用 Redux DevTools

## ⚠️ 常见问题

### 问题：连接失败
**解决**:
```bash
# 确保您的电脑和 iPhone 在同一 WiFi 网络上
# 或使用 Tunnel：
npm run tunnel
```

### 问题：模块找不到
**解决**:
```bash
# 清除依赖并重新安装
rm -rf node_modules package-lock.json
npm install
```

### 问题：黑屏启动
**解决**:
```bash
# 使用清除缓存的方式启动
npm start --clear
```

## 📚 学习资源

- [Expo 官方文档](https://docs.expo.dev/)
- [项目结构详解](./STRUCTURE.md)
- [Redux 官方文档](https://redux.js.org/)

## ✅ 验证安装

```bash
# 检查 Node.js 版本
node -v        # 应该 >= 18.0.0

# 检查 npm 版本
npm -v         # 应该 >= 8.5.2

# 检查 Expo CLI
npm install -g expo-cli
expo --version # 应该显示版本号
```

## 🎉 下一步

1. 运行 `npm install`
2. 运行 `npm start`
3. 在手机上安装 Expo Go
4. 扫描二维码运行应用！

---

祝您编码愉快！🎵🚀

**Expo 让 React Native 开发变得超级简单！**
