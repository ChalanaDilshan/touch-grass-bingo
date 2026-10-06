import io
from typing import Optional, List, Dict, Any
import torch
import open_clip
from PIL import Image, ImageOps

# Model configuration: Lightweight ViT-B-32 to run efficiently on CPU with low RAM
MODEL_NAME = 'ViT-B-32'
PRETRAINED = 'laion2b_s34b_b79k'

print(f"Loading OpenCLIP model ({MODEL_NAME} - {PRETRAINED})...")
model, _, preprocess = open_clip.create_model_and_transforms(MODEL_NAME, pretrained=PRETRAINED)
model.eval()  # Evaluation mode disables dropout and batchnorm updates
tokenizer = open_clip.get_tokenizer(MODEL_NAME)
print("OpenCLIP model loaded successfully.")

# In-memory cache for precomputed text embeddings
_TEXT_EMBEDDINGS_CACHE: Dict[str, Dict[str, Any]] = {}


def precompute_item_embeddings(items: List[Dict[str, Any]]) -> None:
    """
    Precompute and cache normalized text embeddings for all item prompts and distractors.
    This eliminates repeated text encoding on CPU during image verification requests.
    """
    global _TEXT_EMBEDDINGS_CACHE
    with torch.no_grad():
        for item in items:
            item_id = str(item["id"])
            target_prompt = item["prompt"]
            distractors = item.get("distractors", [])
            texts = [target_prompt] + distractors

            tokens = tokenizer(texts)
            text_features = model.encode_text(tokens)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            _TEXT_EMBEDDINGS_CACHE[item_id] = {
                "texts": texts,
                "text_features": text_features,
                "target_prompt": target_prompt,
                "threshold": float(item.get("threshold", 0.5)),
            }
    print(f"Precomputed text embeddings for {len(_TEXT_EMBEDDINGS_CACHE)} items.")


def verify_image(
    image_bytes: bytes,
    target_prompt: Optional[str] = None,
    distractors: Optional[List[str]] = None,
    threshold: float = 0.5,
    item_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Verify an uploaded image against target prompt and negative distractors using zero-shot classification.
    Uses cached text embeddings if item_id is provided and cached.
    """
    try:
        # Load image and correct EXIF orientation (common on mobile phone uploads)
        raw_image = Image.open(io.BytesIO(image_bytes))
        image = ImageOps.exif_transpose(raw_image).convert('RGB')
        image_input = preprocess(image).unsqueeze(0)

        # Retrieve cached embeddings or compute on-the-fly
        cached = _TEXT_EMBEDDINGS_CACHE.get(str(item_id)) if item_id else None

        if cached:
            texts = cached["texts"]
            text_features = cached["text_features"]
            threshold = cached["threshold"]
        else:
            if not target_prompt:
                return {"match": False, "confidence": 0.0, "error": "No prompt or item_id provided"}
            distractor_list = distractors or []
            texts = [target_prompt] + distractor_list
            tokens = tokenizer(texts)
            with torch.no_grad():
                text_features = model.encode_text(tokens)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        # Image inference on CPU (no autocast needed for float32 on CPU)
        with torch.no_grad():
            image_features = model.encode_image(image_input)
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            # Cosine similarity scaled by 100 for softmax probabilities
            text_probs = (100.0 * image_features @ text_features.T).softmax(dim=-1)

        probs = text_probs[0].tolist()
        target_confidence = probs[0]
        max_prob = max(probs)
        top_idx = probs.index(max_prob)
        top_match = texts[top_idx]

        # Match criteria: target prompt must have the highest probability AND exceed threshold
        is_match = (top_idx == 0) and (target_confidence >= threshold)

        return {
            "match": is_match,
            "confidence": round(target_confidence, 4),
            "threshold": threshold,
            "top_match": top_match,
            "details": {texts[i]: round(probs[i], 4) for i in range(len(texts))}
        }

    except Exception as e:
        print(f"Error processing image: {e}")
        return {"match": False, "confidence": 0.0, "error": str(e)}