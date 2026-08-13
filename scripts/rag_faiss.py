import json
import math
import sqlite3
import sys
from pathlib import Path

import faiss
import numpy as np


EMBEDDING_DIMENSION = 128


def hash_token(token: str) -> int:
    value = 2166136261
    for char in token:
        value ^= ord(char)
        value = (value * 16777619) & 0xFFFFFFFF
    return abs(value)


def tokenize(value: str) -> list[str]:
    cleaned = ''.join(char.lower() if char.isalnum() or char.isspace() else ' ' for char in value)
    return [token for token in cleaned.split() if token]


def embed_text(value: str, dimension: int) -> list[float]:
    vector = np.zeros(dimension, dtype=np.float32)
    for token in tokenize(value):
      hashed = hash_token(token)
      position = hashed % dimension
      sign = 1.0 if hashed % 2 == 0 else -1.0
      vector[position] += sign

    norm = np.linalg.norm(vector)
    if norm > 0:
        vector = vector / norm
    return vector.tolist()


def rebuild_index(payload: dict[str, object]) -> dict[str, object]:
    sqlite_path = Path(str(payload["sqlitePath"]))
    index_path = Path(str(payload["indexPath"]))
    meta_path = Path(str(payload["metaPath"]))
    dimension = int(payload.get("dimension", EMBEDDING_DIMENSION))

    connection = sqlite3.connect(sqlite_path)
    try:
        rows = connection.execute(
            """
            SELECT id, embedding_json
            FROM sentence_units
            ORDER BY id
            """
        ).fetchall()
    finally:
        connection.close()

    index = faiss.IndexFlatIP(dimension)
    chunk_ids: list[str] = []
    vectors: list[list[float]] = []

    for chunk_id, embedding_json in rows:
        if not embedding_json:
            continue
        chunk_ids.append(chunk_id)
        vectors.append(json.loads(embedding_json))

    if vectors:
        matrix = np.array(vectors, dtype=np.float32)
        faiss.normalize_L2(matrix)
        index.add(matrix)

    index_path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(index_path))
    meta_path.write_text(json.dumps({"chunkIds": chunk_ids}, indent=2), encoding="utf-8")

    return {"indexedChunks": len(chunk_ids)}


def search_index(payload: dict[str, object]) -> dict[str, object]:
    index_path = Path(str(payload["indexPath"]))
    meta_path = Path(str(payload["metaPath"]))
    query = str(payload["query"])
    top_k = int(payload.get("topK", 10))
    dimension = int(payload.get("dimension", EMBEDDING_DIMENSION))

    if not index_path.exists() or not meta_path.exists():
        return {"matches": []}

    index = faiss.read_index(str(index_path))
    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    chunk_ids: list[str] = metadata.get("chunkIds", [])

    if index.ntotal == 0 or not chunk_ids:
        return {"matches": []}

    query_vector = np.array([embed_text(query, dimension)], dtype=np.float32)
    faiss.normalize_L2(query_vector)
    scores, indices = index.search(query_vector, min(top_k, len(chunk_ids)))

    matches = []
    for score, index_id in zip(scores[0], indices[0]):
        if index_id < 0 or index_id >= len(chunk_ids):
            continue
        matches.append(
            {
                "chunkId": chunk_ids[index_id],
                "score": round(float(score), 6),
            }
        )

    return {"matches": matches}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: rag_faiss.py <rebuild|search> <json-payload>")

    command = sys.argv[1]
    payload = json.loads(sys.argv[2])

    if command == "rebuild":
        result = rebuild_index(payload)
    elif command == "search":
        result = search_index(payload)
    else:
        raise SystemExit(f"unsupported command: {command}")

    print(json.dumps(result))


if __name__ == "__main__":
    main()
