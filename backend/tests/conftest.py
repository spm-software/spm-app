import copy
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ["INITIAL_ALLOWED_EMAILS"] = ""

import server  # noqa: E402


class FakeCursor:
    def __init__(self, docs):
        self.docs = [copy.deepcopy(doc) for doc in docs]

    def sort(self, key, direction):
        reverse = direction == -1
        self.docs.sort(key=lambda doc: doc.get(key) or "", reverse=reverse)
        return self

    async def to_list(self, length=None):
        if length is None:
            return copy.deepcopy(self.docs)
        return copy.deepcopy(self.docs[:length])


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def create_index(self, *args, **kwargs):
        return None

    async def insert_one(self, doc):
        self.docs.append(copy.deepcopy(doc))
        return SimpleNamespace(inserted_id=doc.get("id"))

    async def insert_many(self, docs):
        self.docs.extend(copy.deepcopy(docs))
        return SimpleNamespace(inserted_ids=[doc.get("id") for doc in docs])

    def find(self, query=None, projection=None):
        query = query or {}
        return FakeCursor([self._project(doc, projection) for doc in self.docs if self._matches(doc, query)])

    async def find_one(self, query=None, projection=None):
        query = query or {}
        for doc in self.docs:
            if self._matches(doc, query):
                return self._project(doc, projection)
        return None

    async def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if self._matches(doc, query):
                before = copy.deepcopy(doc)
                self._apply_update(doc, update, inserting=False)
                return SimpleNamespace(matched_count=1, modified_count=int(doc != before))
        if upsert:
            new_doc = copy.deepcopy(query)
            self._apply_update(new_doc, update, inserting=True)
            self.docs.append(new_doc)
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=new_doc.get("id"))
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def update_many(self, query, update):
        matched = 0
        modified = 0
        for doc in self.docs:
            if self._matches(doc, query):
                before = copy.deepcopy(doc)
                self._apply_update(doc, update, inserting=False)
                matched += 1
                modified += int(doc != before)
        return SimpleNamespace(matched_count=matched, modified_count=modified)

    async def delete_one(self, query):
        for index, doc in enumerate(self.docs):
            if self._matches(doc, query):
                del self.docs[index]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def delete_many(self, query):
        kept = []
        deleted = 0
        for doc in self.docs:
            if self._matches(doc, query):
                deleted += 1
            else:
                kept.append(doc)
        self.docs = kept
        return SimpleNamespace(deleted_count=deleted)

    async def count_documents(self, query):
        return sum(1 for doc in self.docs if self._matches(doc, query))

    async def distinct(self, key):
        return sorted({doc.get(key) for doc in self.docs if doc.get(key) is not None})

    def _apply_update(self, doc, update, inserting):
        if "$set" in update:
            doc.update(copy.deepcopy(update["$set"]))
        if inserting and "$setOnInsert" in update:
            doc.update(copy.deepcopy(update["$setOnInsert"]))

    def _project(self, doc, projection):
        doc = copy.deepcopy(doc)
        if not projection:
            return doc
        includes = {key for key, value in projection.items() if value and key != "_id"}
        if includes:
            return {key: doc[key] for key in includes if key in doc}
        for key, value in projection.items():
            if value == 0:
                doc.pop(key, None)
        return doc

    def _matches(self, doc, query):
        for key, expected in query.items():
            actual = doc.get(key)
            if isinstance(expected, dict):
                for op, value in expected.items():
                    if op == "$ne" and actual == value:
                        return False
                    if op == "$in" and actual not in value:
                        return False
                    if op == "$gte" and (actual is None or actual < value):
                        return False
                    if op == "$lt" and (actual is None or actual >= value):
                        return False
                continue
            if actual != expected:
                return False
        return True


class FakeDB:
    def __init__(self):
        self._collections = {}

    def __getattr__(self, name):
        if name not in self._collections:
            self._collections[name] = FakeCollection()
        return self._collections[name]


@pytest.fixture
def fake_db(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(server, "db", db)
    server.background_tasks_status.clear()
    return db


@pytest.fixture
def auth_headers(fake_db):
    email = "admin@example.com"
    fake_db.allowed_emails.docs.append({"id": "allowed-1", "email": email, "created_at": "2026-01-01T00:00:00+00:00"})
    token = server._create_jwt(email=email, name="Admin")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(fake_db):
    with TestClient(server.app) as test_client:
        yield test_client
