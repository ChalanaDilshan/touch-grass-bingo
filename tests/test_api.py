import io
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from app.main import app, ALL_ITEMS
from app.model import verify_image, precompute_item_embeddings


@pytest.fixture(scope="session", autouse=True)
def setup_embeddings():
    """Ensure text embeddings are precomputed before tests run."""
    precompute_item_embeddings(ALL_ITEMS)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_healthz_endpoint(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "touch-grass-bingo"
    assert data["items_loaded"] == 25
    assert "timestamp" in data


def test_card_generation(client):
    response = client.get("/api/card")
    assert response.status_code == 200
    data = response.json()
    assert "date" in data
    assert "items" in data
    items = data["items"]
    assert len(items) == 9

    # Verify structure and ensure prompts/distractors are not leaked
    for item in items:
        assert "id" in item
        assert "name_en" in item
        assert "name_si" in item
        assert "prompt" not in item
        assert "distractors" not in item
        assert "threshold" not in item


def test_verify_missing_item(client):
    img = Image.new("RGB", (64, 64), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    response = client.post(
        "/api/verify",
        data={"item_id": "non_existent_999"},
        files={"file": ("test.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 404
    data = response.json()
    assert data["match"] is False
    assert "not found" in data["error"].lower()


def test_verify_invalid_file_type(client):
    response = client.post(
        "/api/verify",
        data={"item_id": "1"},
        files={"file": ("test.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["match"] is False
    assert "must be a valid image" in data["error"]


def test_verify_empty_file(client):
    response = client.post(
        "/api/verify",
        data={"item_id": "1"},
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["match"] is False
    assert "empty" in data["error"].lower()


def test_verify_synthetic_image(client):
    # Pure red image tested against Item 1 ("Red Flower" - prompt: "a close up photo of a real red flower...")
    img = Image.new("RGB", (100, 100), color="red")
    buf = io.BytesIO()
    img.save(buf, format="JPEG")

    response = client.post(
        "/api/verify",
        data={"item_id": "1"},
        files={"file": ("red.jpg", buf.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "match" in data
    assert "confidence" in data
    assert "threshold" in data
    assert "top_match" in data
    assert "details" in data
    assert isinstance(data["match"], bool)
    assert isinstance(data["confidence"], float)


def test_get_available_items(client):
    response = client.get("/api/card/available?current_ids=1,2,3")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    items = data["items"]
    assert len(items) == 22
    for item in items:
        assert item["id"] not in ["1", "2", "3"]
        assert "prompt" not in item
        assert "distractors" not in item


def test_swap_random_item(client):
    response = client.post(
        "/api/card/swap",
        json={"replace_id": "1", "current_ids": ["1", "2", "3", "4", "5", "6", "7", "8", "9"]},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    replacement = data["replacement"]
    assert "id" in replacement
    assert replacement["id"] not in ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    assert "name_en" in replacement
    assert "name_si" in replacement


def test_swap_specific_target_item(client):
    response = client.post(
        "/api/card/swap",
        json={"replace_id": "1", "current_ids": ["1", "2"], "target_id": "15"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["replacement"]["id"] == "15"
    assert data["replacement"]["name_en"] == "A Mushroom"


def test_swap_invalid_replace_id(client):
    response = client.post(
        "/api/card/swap",
        json={"replace_id": "9999", "current_ids": ["1"]},
    )
    assert response.status_code == 404
    data = response.json()
    assert "not found" in data["error"].lower()

