# 小程序图标使用规范

## 1. 目的与适用范围

本规范适用于微焦短剧的 uni-app 微信观看端、原生微信小程序过渡端，以及需要复用观看端视觉语言的管理端页面。管理端气泡、表格操作列等 PC 布局约定见 [admin-ui-conventions.md](./admin-ui-conventions.md)。

统一采用两类图标来源：

- **WeUI Icons**：基础导航、系统状态和通用操作。
- **IconPark**：业务语义和品牌化图标。

两者可以组合使用，但同一视觉层级内必须保持线宽、圆角、尺寸和颜色逻辑一致。图标不得因为“有现成资源”而脱离页面的交互语义。

## 2. 图标来源分工

| 场景 | 首选来源 | 示例 |
| --- | --- | --- |
| 返回、关闭、更多、展开、收起 | WeUI Icons | 返回上一页、关闭弹层、更多操作 |
| 搜索、刷新、导航、切换、提示 | WeUI Icons | 搜索框、刷新按钮、Tab/导航状态 |
| 加载、成功、警告、错误、空状态 | WeUI Icons | Toast、表单校验、网络错误 |
| 收藏、点赞、评论、分享 | IconPark | 剧目卡片和播放页互动操作 |
| 播放、暂停、下一集、倍速 | IconPark | 播放器控制和剧场操作 |
| 剧目、权益、广告、会员、榜单 | IconPark | 内容、奖励和运营业务入口 |
| 项目专属品牌图形 | IconPark 或设计稿定制 | Logo、活动主题图形 |

### 2.1 禁止混用的情况

- 不使用 IconPark 图标替代微信系统导航图标，除非设计稿明确要求品牌化处理。
- 不使用 WeUI 的基础图标表达复杂业务含义。
- 同一个交互含义只能保留一个主图标，不因平台不同而改变含义。
- 不在同一按钮中混用 Unicode 符号、CSS 绘制图形和图标资源。

## 3. 资源获取与落地

### 3.1 只使用本地资源

运行时不得依赖 IconPark、Iconfont、CDN 或其他远程地址加载图标。图标下载后进入仓库，由构建产物统一携带。

推荐流程：

1. 在 WeUI 或 IconPark 中选择图标，并确认名称、风格和授权信息。
2. 优先下载单色 SVG；需要最大化微信端兼容性时，同时生成 PNG fallback。
3. 清理无用 metadata、编辑器私有信息和不必要的内联样式。
4. 放入对应端的本地静态资源目录。
5. 在代码中通过集中式映射引用，不在页面模板中散落路径字符串。
6. 在变更说明或资源旁记录来源、图标名称、下载日期和许可证要求。

### 3.2 推荐目录

```text
apps/uniapp/src/static/icons/
apps/miniprogram/miniprogram/assets/icons/
```

如果两端图标完全相同，可以从同一来源重新导出，但不要让一个端直接引用另一个端的构建目录或源码目录。

### 3.3 格式选择

| 格式 | 使用建议 |
| --- | --- |
| SVG | 首选资源格式，适合缩放、单色改色和设计迭代 |
| PNG | 微信端兼容性优先或多色图标的稳定 fallback |
| Iconfont 字体 | 默认不采用；只有确认字体加载、子集、渲染和真机兼容性后才可引入 |
| 在线 SVG/字体/CDN | 禁止用于运行时图标 |

IconPark 官方提供 SVG 和纯 SVG 输出；WeUI 提供面向微信小程序的样式与组件资源。项目只落地实际使用的图标，不整体复制无关组件或整套图标库。

## 4. 命名与组织

文件名使用小写 kebab-case，并体现语义和状态：

```text
search.svg
nav-back.svg
nav-close.svg
favorite.svg
favorite-active.svg
play.svg
play-pause.svg
reward-ad.svg
empty-search.svg
```

状态后缀统一使用：

- `active`：已选中或已激活
- `disabled`：不可操作
- `hover`：仅 H5/管理端需要时使用
- `filled`：面性版本
- `outline`：线性版本

不要使用 `icon1.svg`、`new.svg`、`temp.svg` 或按页面命名的文件名。图标名称描述语义，不描述当前页面位置。

## 5. 视觉规范

### 5.1 风格

- 基础导航默认使用 WeUI 的单色、简洁风格。
- 业务图标默认使用 IconPark 的同一主题、同一描边/面性策略。
- 同一组图标不得同时使用明显不同的圆角、端点、透视角度或视觉重量。
- 不为了填满空间而随意放大图标；图标视觉边界应与文字基线和点击区域分别对齐。

### 5.2 尺寸

尺寸以设计稿和组件 token 为准；没有设计稿时使用以下默认值：

| 用途 | 图标视觉尺寸 | 最小点击区域 |
| --- | ---: | ---: |
| 顶部导航 | 20–24px | 44×44px |
| Tab/底部导航 | 20–24px | 44×44px |
| 列表辅助信息 | 16–20px | 跟随整行点击区域 |
| 播放器主控制 | 24–32px | 44×44px |
| 空状态/业务插图 | 48px 以上 | 按页面布局确定 |

微信小程序中按现有页面单位换算为 `rpx`；不要直接把点击区域压缩成图标本身大小。

### 5.3 颜色

- 基础导航图标默认使用当前文字/图标色 token。
- 正常状态不得使用业务强调色抢夺主操作注意力。
- 激活态只改变颜色、填充或明确状态，不替换成含义不同的图标。
- 禁用态必须同时降低颜色对比度和交互响应，但仍满足可辨识性。
- 深色视频场景优先使用高对比浅色图标，并为图标提供必要的阴影或半透明底。
- 禁止把颜色写死在多个页面；颜色应集中在样式 token 或组件样式中。

## 6. 代码使用规则

### 6.1 集中映射

图标路径集中定义，例如：

```ts
export const ACTION_ICONS = {
  favorite: "/static/icons/favorite.png",
  favoriteActive: "/static/icons/favorite-active.png",
  comment: "/static/icons/comment.png",
  share: "/static/icons/share.png"
} as const;
```

页面只引用语义名称，不直接拼接文件路径。跨端需要一致图标时，保持 key、状态后缀和语义一致。

### 6.2 uni-app

优先使用本地 `<image>` 或项目统一的图标组件。使用 SVG 时必须验证微信小程序构建结果，不假设 H5 能显示就代表微信端可用。

```vue
<image
  class="action-icon"
  :src="ACTION_ICONS.favorite"
  mode="aspectFit"
  aria-hidden="true"
 />
```

### 6.3 原生小程序

优先使用本地 `<image>`，并为交互元素补充可读的 `aria-label` 或等效文本语义。图标本身不能承担唯一的业务说明。

```xml
<button class="icon-button" aria-label="收藏" bindtap="toggleFavorite">
  <image class="action-icon" src="/assets/icons/favorite.png" mode="aspectFit" />
</button>
```

### 6.4 不允许的写法

- 页面内直接写远程 Iconfont/IconPark URL。
- 用 `content: "\\e001"` 这类不可读字体编码替代语义映射。
- 用 CSS border、伪元素或 Unicode 字符临时拼出正式业务图标。
- 通过关闭构建校验、忽略资源缺失或回退到 Demo 图标来掩盖资源问题。

## 7. 可访问性与交互

- 纯装饰图标设置 `aria-hidden="true"` 或等效属性。
- 只有图标的按钮必须有可读标签，例如“返回”“分享”“收藏”。
- 图标按钮必须有至少 44×44px 的触摸区域，并保留明确的按下态。
- 不得只用颜色区分激活/未激活；需要同时改变填充、轮廓、文字或辅助状态。
- 错误、成功、加载等状态不得只展示图标，必须有文字或可读的辅助说明。

## 8. 授权与记录

- WeUI 使用前遵守其 MIT License；官方仓库说明其面向微信小程序并包含 icon 资源。
- IconPark 使用前按仓库及具体资源说明遵守 Apache-2.0 和图标资源附带的授权要求。
- 第三方图标不得只保存图片而丢失来源信息。至少记录：来源库、图标名称、原始链接、下载日期、许可证和是否做过修改。
- 不把未确认授权的设计稿、网络图片或用户上传图标直接纳入正式构建物。
- 生产构建前检查图标资源是否包含不应公开的元数据、远程引用或测试素材。

## 9. 验收清单

新增或替换图标时，至少检查：

- [ ] 来源属于 WeUI 基础图标或 IconPark 业务图标，职责没有混用。
- [ ] 资源已本地化，构建和运行不依赖远程 URL。
- [ ] 文件名、状态后缀和集中映射符合本规范。
- [ ] 正常、激活、禁用和深色背景状态已覆盖。
- [ ] 点击区域不小于 44×44px，图标不阻塞按钮事件。
- [ ] 纯装饰图标已隐藏语义，图标按钮有可读标签。
- [ ] uni-app 微信构建和原生小程序类型检查/构建通过。
- [ ] 至少在微信开发者工具验证一次；涉及视觉、手势或安全区时追加真机验证。
- [ ] 来源和许可证信息已记录，未将秘密或个人信息写入资源。

## 10. 当前项目迁移原则

当前项目已有本地 PNG/SVG 图标资源，并存在少量 Unicode 图标。后续新增图标遵循本规范；已有图标不为了形式统一而一次性重做。

只有在发生页面改动、视觉不一致、资源缺失或真机兼容问题时，才按本规范逐项迁移相关图标，并同步更新 uni-app 与原生小程序端。

参考资料：

- [Tencent/weui-wxss](https://github.com/Tencent/weui-wxss)
- [wechat-miniprogram/weui-miniprogram](https://github.com/wechat-miniprogram/weui-miniprogram)
- [ByteDance/IconPark](https://github.com/bytedance/IconPark)
- [Iconfont 使用说明](https://www.iconfont.cn/help/detail?helptype=code)
