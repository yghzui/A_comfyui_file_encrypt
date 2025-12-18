from .nodes.image_encrypt import ImageEncryptXor
from .nodes.image_encrypt_preview import ImageEncryptXorPreview


NODE_CLASS_MAPPINGS = {
    "ImageEncryptXor": ImageEncryptXor,
    "ImageEncryptXorPreview": ImageEncryptXorPreview,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageEncryptXor": "ImageEncryptXor 图像加密/解密",
    "ImageEncryptXorPreview": "ImageEncryptXorPreview 图像加密预览",
}


WEB_DIRECTORY = "./web/js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]

