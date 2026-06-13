# LAS 点云 Web Viewer 技术路线

本文面向熟悉 C++/Qt/OpenGL、但不熟悉 Web 前端的开发者，说明当前产品的技术架构、LAS 加载链路、效率优化方式，以及后续升级路线。产品定位以浏览器端 LAS 点云查看、航线/部件展示编辑、简单点云分析为主，暂不规划 LAZ 支持。

## 当前技术栈

- UI 层：HTML、CSS、JavaScript。
- 构建与开发服务：Node.js、Vinext/Vite。
- 点云渲染：WebGL，对应 Qt 中的 `QOpenGLWidget` 或自管 OpenGL 渲染窗口。
- 本地文件读取：浏览器 File API，LAS 文件在本机浏览器内解析，不上传服务器。
- 二进制数据结构：`ArrayBuffer`、`DataView`、`Float32Array`、`Uint8Array`，对应 C++ 中连续内存 buffer。
- 业务模块：航线 JSON、部件点、航点编辑、净空分析、标注和测量均以浏览器端 JavaScript 模块实现。
- 项目管理：支持多个 LAS 点云和多个航线 JSON 加载到项目目录树，通过显隐、激活、定位和删除管理图层。

## 与 C++/Qt 的类比

- `public/viewer/index.html`：类似主窗口 UI 布局。
- `public/viewer/src/main.js`：类似 MainWindow/controller，负责文件加载、状态管理、UI 事件和模块协调。
- `public/viewer/src/las.js`：类似 LAS reader，用 `DataView` 解析二进制 header 和 point records。
- `public/viewer/src/renderer.js`：类似 OpenGL renderer，维护相机、VBO、shader、拾取和绘制。
- `public/viewer/src/color.js`：类似颜色映射与过滤模块，生成用于 GPU 上传的颜色 buffer。
- `public/viewer/src/route.js`：类似航线数据模型和 JSON 适配层。
- `requestAnimationFrame`：类似 Qt 的 `update()`/paint 调度，但由浏览器按刷新节奏执行。

## LAS 加载链路

1. 用户选择或拖入 `.las` 文件。
2. 浏览器通过 `file.arrayBuffer()` 将本地文件读入内存。
3. `las.js` 读取 LAS header，确认 point format、点数、offset、scale、RGB、classification 等字段。
4. 根据点数和浏览器预算计算抽样步长 `stride`。
5. 将点坐标转换到局部坐标系，并写入 `Float32Array`。
6. 将 RGB 或分类/高程颜色写入 `Uint8Array`。
7. `renderer.setCloud()` 将坐标和颜色上传到 WebGL buffer。
8. WebGL 通过 `gl.drawArrays(gl.POINTS, 0, pointCount)` 批量绘制点云。

当前路线是浏览器本地解析 LAS，不依赖后端服务，不支持 LAZ 压缩格式。

多 LAS 场景下，第一版以首个点云的 LAS 中心作为项目局部坐标原点。后续加载的 LAS 会从各自局部坐标转换到同一项目局部坐标系，再把所有可见点云合成为一个 WebGL 渲染 buffer。这个方案能尽快提供目录树和多图层工作流；后续大规模数据再升级为真正的多 buffer、分块和 LOD。

## 当前效率优化

- 点数抽样：设置最大渲染点数预算，超大 LAS 按 `ceil(pointCount / maxRenderPoints)` 抽样，避免一次性绘制几千万点导致浏览器卡死。
- TypedArray 连续内存：坐标和颜色使用 typed array，减少对象分配和 GC 压力，便于直接上传 GPU。
- GPU buffer 渲染：点云不是 DOM 节点，而是 WebGL VBO 批量渲染。
- 局部坐标：点云坐标以中心点归一到局部空间，降低大坐标对浮点精度的影响。
- 按需渲染：相机变化、显示模式变化、窗口 resize、数据更新时才请求下一帧，避免空闲时持续占用 CPU/GPU。
- 颜色重建分离：RGB、高程、类别、过滤和裁剪在 `color.js` 中统一生成渲染 buffer，保持渲染器简单。
- 可见图层合成：项目树中可见的 LAS 图层会分别完成分类/高程/RGB 着色和过滤，再合成为一个连续 GPU buffer。
- 轻量分析：剖面、净空和相机预览基于当前抽样点集计算，保证第一版交互流畅。

## 只支持 LAS 的边界

短中期只支持 `.las`，不支持 `.laz`。原因：

- LAS 是未压缩点记录，浏览器端二进制解析直接、可控。
- LAZ 需要解压库和额外 CPU/WASM 成本，会明显增加工程复杂度。
- 当前产品优先验证电力巡检工作流、航线编辑、显示和基础分析能力，LAS 已满足第一阶段数据入口。

如果后续需要接入 LAZ，应作为独立里程碑评估，不混入当前 LAS 渲染优化路线。

## 升级路线

### 阶段 1：稳固当前 LAS Viewer

- 保持浏览器本地 LAS 解析和 WebGL 点渲染。
- 支持项目目录树，管理多个 LAS 点云和多个航线 JSON。
- 完善航点、部件点、视椎体、相机预览、测量、剖面、净空分析。
- 提升 UI 操作一致性，包括鼠标反转、视角预设、标注、截图和导出。
- 建立基础测试：LAS header/parse、航线 JSON、分析算法、构建验证。

### 阶段 2：解析与计算移出主线程

- 将 LAS 解析、颜色 buffer 重建、剖面/净空等重计算放入 Web Worker。
- 主线程只负责 UI、WebGL 渲染和轻量状态同步。
- Worker 与主线程之间传递 typed array，并尽量使用 transferable object 减少拷贝。
- 目标是加载大文件、切换分类颜色、执行分析时不阻塞交互。

### 阶段 3：分块与 LOD

- 将单一大 buffer 升级为点云 tile/chunk 管理。
- 建立 LAS 预处理或浏览器端分块索引，按空间范围组织点。
- 根据相机距离、屏幕占比和视锥范围选择不同密度点集。
- 引入视锥裁剪、距离裁剪、点预算调度和渐进加载。
- 目标是从“抽样看全局”升级到“近处高密、远处低密”的工程级浏览体验。

### 阶段 4：渲染质量与交互增强

- 优化 EDL、点大小衰减、分类透明度、按类别隐藏/强调。
- 支持多选、框选、裁剪盒、局部隔离和局部统计。
- 增强航线编辑：拖拽航点、编辑姿态、联动目标点、相机视场预览。
- 增强电力场景能力：导线/杆塔/植被/交跨的专题显示和风险结果导出。

### 阶段 5：WASM/C++ 复用评估

- 对计算密集模块评估 WASM：LAS 解析、空间索引、近邻搜索、导线拟合、净空分析。
- C++/Qt 现有算法如有成熟实现，可抽离为纯 C++ core，再编译为 WASM 供 Web 端调用。
- UI 和渲染仍保留 Web 架构，算法核心可逐步复用 C++ 资产。

### 阶段 6：WebGPU 评估

- WebGL 仍作为主线，因为兼容性更稳定。
- 当点云规模、shader 复杂度、GPU picking 或计算需求上升后，再评估 WebGPU。
- WebGPU 可用于更大规模 buffer 管理、GPU 计算、可视化效果和更现代的渲染管线。
- WebGPU 不应早期引入，避免在业务工作流尚未稳定时增加平台风险。

## 推荐近期优先级

1. 先把 LAS + 航线 + 基础分析体验做扎实。
2. 再引入 Web Worker，解决大文件加载和颜色重建时的主线程卡顿。
3. 然后做分块/LOD，解决大场景浏览精度和性能问题。
4. 最后评估 WASM 和 WebGPU，把 C++ 算法资产和更强 GPU 管线逐步接入。

这条路线的核心原则是：先稳定业务工作流，再优化数据规模；先用 WebGL 和 Worker 做到可靠，再考虑 WASM/WebGPU。
