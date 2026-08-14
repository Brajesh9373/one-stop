import json
import os
import sqlite3
import sys
from pathlib import Path

import faiss
import numpy as np


def atomic_write_index(index: faiss.Index, destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + '.tmp')
    faiss.write_index(index, str(temporary))
    os.replace(temporary, destination)


def atomic_write_json(payload: dict[str, object], destination: Path) -> None:
    temporary = destination.with_suffix(destination.suffix + '.tmp')
    temporary.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    os.replace(temporary, destination)


def rebuild_index(payload: dict[str, object]) -> dict[str, object]:
    sqlite_path = Path(str(payload['sqlitePath']))
    index_path = Path(str(payload['indexPath']))
    meta_path = Path(str(payload['metaPath']))
    dimension = int(payload['dimension'])

    with sqlite3.connect(sqlite_path) as connection:
        rows = connection.execute(
            'SELECT id, embedding_json FROM sentence_units ORDER BY id'
        ).fetchall()

    chunk_ids: list[str] = []
    vectors: list[list[float]] = []
    for chunk_id, embedding_json in rows:
        if not embedding_json:
            continue
        vector = json.loads(embedding_json)
        if len(vector) != dimension:
            raise ValueError(f'embedding dimension mismatch for {chunk_id}')
        chunk_ids.append(chunk_id)
        vectors.append(vector)

    index = faiss.IndexFlatIP(dimension)
    if vectors:
        matrix = np.asarray(vectors, dtype=np.float32)
        faiss.normalize_L2(matrix)
        index.add(matrix)

    index_path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_index(index, index_path)
    atomic_write_json({
        'chunkIds': chunk_ids,
        'dimension': dimension,
        'fingerprint': str(payload.get('fingerprint', 'unknown')),
    }, meta_path)
    return {'indexedChunks': len(chunk_ids), 'dimension': dimension}


def allowed_ids(payload: dict[str, object]) -> set[str]:
    scope_filter = payload.get('filter')
    if not isinstance(scope_filter, dict):
        return set()
    operator = '=' if scope_filter.get('scope') == 'lecture' else '!='
    query = (
        'SELECT id FROM sentence_units WHERE institution_id = ? AND course_id = ? '
        f'AND lecture_id {operator} ?'
    )
    with sqlite3.connect(str(payload['sqlitePath'])) as connection:
        rows = connection.execute(query, (
            str(scope_filter.get('institutionId', '')),
            str(scope_filter.get('courseId', '')),
            str(scope_filter.get('lectureId', '')),
        )).fetchall()
    return {str(row[0]) for row in rows}


def search_index(payload: dict[str, object]) -> dict[str, object]:
    index_path = Path(str(payload['indexPath']))
    meta_path = Path(str(payload['metaPath']))
    top_k = max(1, int(payload.get('topK', 10)))
    dimension = int(payload['dimension'])
    query_vector = payload.get('queryVector')
    if not isinstance(query_vector, list) or len(query_vector) != dimension:
        raise ValueError('invalid query vector')
    if not index_path.exists() or not meta_path.exists():
        return {'matches': []}

    index = faiss.read_index(str(index_path))
    metadata = json.loads(meta_path.read_text(encoding='utf-8'))
    chunk_ids: list[str] = metadata.get('chunkIds', [])
    permitted = allowed_ids(payload)
    if index.ntotal == 0 or not chunk_ids or not permitted:
        return {'matches': []}

    vector = np.asarray([query_vector], dtype=np.float32)
    faiss.normalize_L2(vector)
    # Exact flat search is scanned fully so metadata filtering cannot hide a relevant lecture hit.
    scores, indices = index.search(vector, len(chunk_ids))
    matches = []
    for score, index_id in zip(scores[0], indices[0]):
        if index_id < 0 or index_id >= len(chunk_ids):
            continue
        chunk_id = chunk_ids[index_id]
        if chunk_id not in permitted:
            continue
        matches.append({'chunkId': chunk_id, 'score': round(float(score), 6)})
        if len(matches) >= top_k:
            break
    return {'matches': matches}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit('usage: rag_faiss.py <rebuild|search> <json-payload>')
    command, payload = sys.argv[1], json.loads(sys.argv[2])
    result = rebuild_index(payload) if command == 'rebuild' else search_index(payload)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
