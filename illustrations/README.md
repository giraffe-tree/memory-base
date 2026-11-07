# 知识点 SVG 图解

当前 82 个知识点各有一张 SVG。原有三组文件保留；新增 Hindsight/Graphiti/Cognee、OpenViking/EverOS/MemOS、LangMem/Memobase、Anthropic 与十框架比较五组内容，共 246 个切面、396 处固定版本源码引用。各组按文件边界并行编写，交叉审阅后统一整合。

每份 spec 的 `lesson` 对应课程 ID；`steps` 的三个位置对应图中 01/02/03、网页按钮与导出说明。`object` 解释实体隐喻，`boundary` 保留成立条件和未验证范围。比较图的位置是并列对照，不表示系统之间串行调用。两篇待验证实验只解释方案，不能视为结果。

四种共享造型分别是三座档案架、筛选台、压印台、三个检验工位。它们用于解释状态归属、筛选、完成点和验收边界；不同课程复用造型，说明与证据按课程独立编写。部件数量、形状和尺寸没有性能或运行测量含义。

维护后运行 `npm run build`，构建器会生成并核对 [独立 SVG](../web/public/illustrations/)，将 spec 接入课程数据。提交 JSON 和重新生成的 SVG。图形按页请求，不把所有 SVG 塞进主 JavaScript。

- 构建检查覆盖课程完整性、步骤数量、导出文字长度、证据仓库/HTTPS/固定 SHA/文件路径与课程声明的项目。
- 几何检查覆盖实体相交与绘制偏序，不能代替人工观察支撑关系与隐喻是否恰当。
- 网页可使用鼠标或方向键切换切面，保留减少动态效果偏好。导出 SVG 自带标题、说明、边界和可点击证据，不依赖 JavaScript。
- 结构校验不证明语义正确；每次调整结论仍要回到相应固定源码核验。

几何与排版源代码在 [figure-geometry.mjs](../scripts/figure-geometry.mjs)、[build-figures.mjs](../scripts/build-figures.mjs)。投影与基础实体渲染复用 Anatomy 的 MIT 许可代码，版权声明在 [vendor/anatomy/LICENSE](../scripts/vendor/anatomy/LICENSE)，并保留于每张导出的 SVG。
