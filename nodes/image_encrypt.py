import numpy as np
import torch


ENCRYPTION_SEED = 42


class ImageEncryptXor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (["encrypt", "decrypt"],),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "process"
    CATEGORY = "A_comfyui_file_encrypt/Image"

    def process(self, image: torch.Tensor, mode: str):
        if not isinstance(image, torch.Tensor):
            image = torch.tensor(image)
        img = image.clamp(0.0, 1.0)
        device = img.device
        orig_dtype = img.dtype
        arr = (img.detach().cpu().numpy() * 255.0).round().clip(0, 255).astype(
            np.uint8
        )
        rng = np.random.RandomState(ENCRYPTION_SEED)
        mask = rng.randint(0, 256, size=arr.shape, dtype=np.uint8)
        enc = np.bitwise_xor(arr, mask)
        enc_f32 = enc.astype(np.float32) / 255.0
        out = torch.from_numpy(enc_f32).to(device=device, dtype=orig_dtype)
        return (out,)

