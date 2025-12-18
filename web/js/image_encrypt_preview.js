import { app } from "../../../scripts/app.js";
import { ComfyWidgets } from "../../../scripts/widgets.js";

class NumpyLikeMT19937 {
    constructor(seed) {
        this.N = 624;
        this.M = 397;
        this.MATRIX_A = 0x9908b0df;
        this.UPPER_MASK = 0x80000000;
        this.LOWER_MASK = 0x7fffffff;
        this.mt = new Uint32Array(this.N);
        this.mti = this.N + 1;
        this.byteBuffer = 0;
        this.bytesRemaining = 0;
        this.seed(seed);
    }

    seed(seed) {
        this.mt[0] = seed >>> 0;
        for (let i = 1; i < this.N; i++) {
            const x = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
            this.mt[i] = (Math.imul(1812433253, x) + i) >>> 0;
        }
        this.mti = this.N;
        this.byteBuffer = 0;
        this.bytesRemaining = 0;
    }

    nextUint32() {
        let y;
        if (this.mti >= this.N) {
            for (let kk = 0; kk < this.N; kk++) {
                const v = (this.mt[kk] & this.UPPER_MASK) | (this.mt[(kk + 1) % this.N] & this.LOWER_MASK);
                const vShift = v >>> 1;
                const vA = v & 1 ? this.MATRIX_A : 0;
                this.mt[kk] = this.mt[(kk + this.M) % this.N] ^ vShift ^ vA;
            }
            this.mti = 0;
        }
        y = this.mt[this.mti++];
        y ^= y >>> 11;
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= y >>> 18;
        return y >>> 0;
    }

    nextUint8() {
        if (this.bytesRemaining === 0) {
            this.byteBuffer = this.nextUint32();
            this.bytesRemaining = 4;
        }
        const b = this.byteBuffer & 0xff;
        this.byteBuffer >>>= 8;
        this.bytesRemaining -= 1;
        return b;
    }
}

function decryptImageDataWithXor(imageData) {
    const rng = new NumpyLikeMT19937(42);
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    const pixelCount = width * height;
    let idx = 0;
    for (let i = 0; i < pixelCount; i++) {
        data[idx] = data[idx] ^ rng.nextUint8();
        data[idx + 1] = data[idx + 1] ^ rng.nextUint8();
        data[idx + 2] = data[idx + 2] ^ rng.nextUint8();
        idx += 4;
    }
    return imageData;
}

async function decryptImageElement(img) {
    if (!img) {
        return null;
    }
    if (!img.naturalWidth || !img.naturalHeight) {
        if (!img.complete) {
            await new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
            });
        }
    }
    if (!img.naturalWidth || !img.naturalHeight) {
        return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return null;
    }
    ctx.drawImage(img, 0, 0);
    let imageData;
    try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
        return null;
    }
    decryptImageDataWithXor(imageData);
    ctx.putImageData(imageData, 0, 0);
    try {
        return canvas.toDataURL();
    } catch {
        return null;
    }
}

app.registerExtension({
    name: "A_comfyui_file_encrypt.ImageEncryptXorPreview",
    async beforeRegisterNodeDef(nodeType, nodeData, appInstance) {
        if (nodeData.name !== "ImageEncryptXorPreview") {
            return;
        }

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);

            if (!this.widgets) {
                this.widgets = [];
            }

            const widgetSpec = ["BOOLEAN", { default: false }];
            const w = ComfyWidgets.BOOLEAN(this, "decrypt_preview", widgetSpec, appInstance).widget;
            w.label = "解密预览";
            w.callback = (value) => {
                this.decrypt_preview = value;
                if (this.imgs && this.imgs.length) {
                    for (const img of this.imgs) {
                        if (!img) continue;
                        if (value) {
                            if (img.__encryptedSrc && img.__decrypted) {
                                continue;
                            }
                            if (!img.__encryptedSrc) {
                                img.__encryptedSrc = img.src;
                            }
                            img.__decrypted = false;
                            void decryptImageElement(img).then((dataUrl) => {
                                if (!dataUrl) return;
                                if (!this.decrypt_preview) {
                                    return;
                                }
                                img.src = dataUrl;
                                img.__decrypted = true;
                                appInstance.graph.setDirtyCanvas(true, false);
                            });
                        } else if (img.__encryptedSrc && img.__decrypted) {
                            img.src = img.__encryptedSrc;
                            img.__decrypted = false;
                        }
                    }
                }
                appInstance.graph.setDirtyCanvas(true, false);
            };
            this.decrypt_preview = !!w.value;
        };

        const onDrawBackground = nodeType.prototype.onDrawBackground;
        nodeType.prototype.onDrawBackground = function (ctx) {
            let decryptEnabled = !!this.decrypt_preview;
            if (this.widgets && this.widgets.length) {
                const widget = this.widgets.find((w) => w.name === "decrypt_preview");
                if (widget) {
                    decryptEnabled = !!widget.value;
                    this.decrypt_preview = decryptEnabled;
                }
            }
            if (decryptEnabled && this.imgs && this.imgs.length) {
                const idx = this.imageIndex ?? 0;
                const img = this.imgs[idx];
                if (img && !img.__decryptRequested) {
                    img.__decryptRequested = true;
                    if (!img.__encryptedSrc) {
                        img.__encryptedSrc = img.src;
                    }
                    img.__decrypted = false;
                    void decryptImageElement(img).then((dataUrl) => {
                        if (!dataUrl) return;
                        if (!this.decrypt_preview) {
                            return;
                        }
                        img.src = dataUrl;
                        img.__decrypted = true;
                        appInstance.graph.setDirtyCanvas(true, false);
                    });
                }
            } else if (!decryptEnabled && this.imgs && this.imgs.length) {
                for (const img of this.imgs) {
                    if (img && img.__encryptedSrc && img.__decrypted) {
                        img.src = img.__encryptedSrc;
                        img.__decrypted = false;
                    }
                }
            }
            return onDrawBackground?.apply(this, arguments);
        };
    },
});
