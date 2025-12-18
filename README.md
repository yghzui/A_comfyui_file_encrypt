# A_comfyui_file_encrypt - 图像加密与前端解密预览扩展

本扩展提供一套针对 ComfyUI 的“图像加密 + 仅前端解密预览”方案，用于在工作流中对输出图像进行随机掩码加密，同时在前端节点上安全地查看**解密后的预览**，而不在后端留下任何解密文件。

## 1. 节点列表概览

- `ImageEncryptXor`
  - 类型名: `ImageEncryptXor`
  - 分类: `A_comfyui_file_encrypt/Image`
  - 功能: 对输入的 `IMAGE` 使用固定种子 XOR 掩码加密（再次经过同样节点等价于解密）。
  - 特点: 对称加密（加密/解密同一个运算），不依赖额外密钥文件。

- `ImageEncryptXorPreview`
  - 类型名: `ImageEncryptXorPreview`
  - 分类: `A_comfyui_file_encrypt/Image`
  - 基类: 核心节点 `PreviewImage`
  - 标记: `OUTPUT_NODE = True`（输出节点）
  - 功能: 保存加密后的图像到临时目录并在前端显示预览，带有“解密预览”前端开关，**解密逻辑完全在浏览器端执行**。

## 2. 加密节点 `ImageEncryptXor` 使用说明

文件: `nodes/image_encrypt.py`

### 2.1 输入与输出

- 输入 (`INPUT_TYPES`):
  - `image: IMAGE`
  - `enabled: BOOLEAN`（是否启用加密，默认 `True`）
- 输出 (`RETURN_TYPES`):
  - `IMAGE`（与输入 shape 相同）

### 2.2 行为逻辑

- 当 `enabled = True` 时:
  - 将 `image` 张量从 `[0,1]` 浮点缩放为 `uint8`。
  - 使用固定种子 `ENCRYPTION_SEED = 42` 创建 `numpy.random.RandomState(42)`。
  - 按图像 shape 生成 `uint8` 掩码 `mask`，与原图做逐元素 `np.bitwise_xor`。
  - 将结果转换回 `[0,1]` 浮点张量返回。
- 当 `enabled = False` 时:
  - 原样返回输入图像（不做加密）。

### 2.3 对称性与兼容性

- XOR 运算满足: `A ^ B ^ B = A`。
- 因此:
  - 原图 → 经过一次 `ImageEncryptXor` = 加密图。
  - 加密图 → 再经过一次 `ImageEncryptXor`（同样的种子）= 解密回原图。
- 这与桌面工具 `png加密.py` 使用的算法完全兼容（同样的种子和掩码生成方式）。

## 3. 输出节点 `ImageEncryptXorPreview` 使用说明

文件: `nodes/image_encrypt_preview.py`

### 3.1 节点属性

- 继承自核心 `PreviewImage` 节点。
- 分类: `A_comfyui_file_encrypt/Image`
- 标记: `OUTPUT_NODE = True`（会被当作输出节点处理）。

### 3.2 后端行为

- 行为与标准 `PreviewImage` 一致:
  - 接收 `IMAGE` 张量（一般来自 `ImageEncryptXor` 的输出）。
  - 将张量保存为 PNG 文件到临时目录（类型通常为 `temp`）。
  - 通过 `{"ui": {"images": [...]}}` 的形式将这些**加密后的 PNG 路径**发送给前端。
- 重要: **后端从头到尾只保存、只暴露“加密后的图像文件”**，不会保存任何解密版本。

## 4. 前端解密预览逻辑

文件: `web/js/image_encrypt_preview.js`

### 4.1 注册扩展

- 扩展名: `A_comfyui_file_encrypt.ImageEncryptXorPreview`
- 作用对象: 仅针对 `nodeData.name === "ImageEncryptXorPreview"` 的节点。
- 通过 `WEB_DIRECTORY = "./web/js"` 和前端扩展入口自动加载。

### 4.2 解密算法 (前端)

- 使用 `NumpyLikeMT19937` 在浏览器中复刻 `numpy.random.RandomState(42)` 的 MT19937 行为。
- 对 `<img>` 对应的 `ImageData`（RGBA 像素）执行:
  - 仅对 R/G/B 三个通道应用 XOR 掩码。
  - Alpha 通道保持不变。
  - 遍历顺序与后端 `size=(H, W, 3)` 的 C-order 一致。
- 解密后的像素写回 Canvas，然后通过 `canvas.toDataURL()` 生成数据 URL。

### 4.3 “解密预览”开关

在 `ImageEncryptXorPreview` 节点上自动添加一个布尔 Widget:

- 名称: `decrypt_preview`
- 标签: `解密预览`
- 默认值: `False`

行为:

- `decrypt_preview = False`:
  - 节点预览显示的是后端提供的原始 PNG（即加密后的图像）。
- `decrypt_preview = True`:
  - 在前端为每张预览图片:
    - 保存原始加密 URL 到 `img.__encryptedSrc`。
    - 在浏览器中执行 XOR 解密，生成本地 `data:image/png;base64,...`。
    - 将 `<img>` 的 `src` 替换为此 data URL（仅用于显示）。
  - 关闭开关时，恢复 `img.src = img.__encryptedSrc`，再次显示加密图。

为确保状态与显示同步:

- 每次绘制 (`onDrawBackground`) 时:
  - 优先读取 widget 的当前值 (`widget.value`) 作为“真状态”。
  - 若状态为开启且已有图片，则自动触发解密逻辑。
  - 若状态关闭且图片处于解密状态，则自动恢复为加密图。

## 5. 安全性与数据流说明

### 5.1 服务器侧

- 服务器磁盘:
  - 只保存 XOR 加密后的 PNG（由 `ImageEncryptXorPreview` / `PreviewImage` 生成）。
- 对外 HTTP 路径 (`/view?...`):
  - 永远指向加密后的 PNG。
- 服务器端:
  - 不生成、不缓存任何解密后的文件。

### 5.2 前端侧

- 解密过程只在浏览器内存中进行:
  - 使用 `<canvas>` + `ImageData` + XOR 的方式解出明文。
  - 使用 `toDataURL()` 在前端生成 data URL。
  - 不调用任何上传或保存 API，不向服务器发送解密结果。
- 唯一持久的加密图 URL 被保存在 `img.__encryptedSrc` 中，用于在用户关闭“解密预览”时恢复。

换句话说:

- 平台 / 后端能看到的始终是**加密图**；
- 解密图像仅在浏览器端内存中存在，不会自动回流到后端。

## 6. 工作流使用示例

1. 解码生成图像:
   - 使用 `VAEDecode` 或其它节点得到普通 `IMAGE`。
2. 加密:
   - 添加 `ImageEncryptXor` 节点:
     - 连接上一步输出到其 `image` 输入。
     - `enabled = True` 时启用加密；若想暂时绕过加密，可以改为 `False`。
3. 输出与预览:
   - 添加 `ImageEncryptXorPreview` 节点:
     - 将 `ImageEncryptXor` 的输出连接到该节点。
     - 作为输出节点运行工作流。
4. 前端查看:
   - 工作流执行后，前端节点上会显示预览:
     - 默认显示加密后的图像。
     - 勾选节点上的 `解密预览` 切换为前端解密后的明文显示。

## 7. 与其它工具的兼容性

- 加密算法与桌面工具 `png加密.py` 一致:
  - 使用相同的 `ENCRYPTION_SEED`、相同的 `RandomState` 种子和掩码生成逻辑。
  - 因此:
    - 在桌面工具中加密的图片，可以通过本节点再次“加密”（即解密）还原；
    - 反之，ComfyUI 中加密的 PNG，也可在桌面工具中通过相同逻辑解密。

## 8. 注意事项

- `ImageEncryptXor` 节点的加密是对称的:
  - 相同种子、相同算法，被加密一次的图像再通过同一节点运行一次即可解密。
- 要求前端使用新 ComfyUI 前端:
  - 本扩展依赖新前端的节点输出/预览机制。
- 若在 Subgraph 或 GroupNode 中使用:
  - 解密预览的逻辑依赖节点的 `imgs` 数组和标准预览流程，不会访问节点坐标，因此不会受到 Subgraph 坐标系影响。

