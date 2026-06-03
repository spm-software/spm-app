"""
Tests for the duplicate comparison batch info fix.
Verifies that /api/questions/by-id and AI duplicate check endpoints
return proper batch_name and batch_date fields.
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
pytestmark = pytest.mark.skipif(
    not BASE_URL,
    reason="Integration test requires REACT_APP_BACKEND_URL",
)

# Test batch IDs from existing data
BATCH_WITH_DUPLICATES = "d5b36186-e03d-45da-8792-0e6661aac562"  # "Hasta 28-02-26" - 141 questions with duplicates
OTHER_BATCH = "13828c13-3f63-44b7-a292-31b46ba4fef9"  # "Hasta 14-02-26"


class TestQuestionByIdEndpoint:
    """Test /api/questions/by-id/{question_id} endpoint returns batch info"""
    
    def test_question_by_id_returns_batch_name_and_date(self):
        """Verify that get_question_by_id returns batch_name and batch_date"""
        # First get a question from the batch
        response = requests.get(f"{BASE_URL}/api/questions", params={"batch_id": BATCH_WITH_DUPLICATES})
        assert response.status_code == 200, f"Failed to get questions: {response.text}"
        
        questions = response.json()
        assert len(questions) > 0, "No questions found in batch"
        
        # Get the first question by ID
        question_id = questions[0]["id"]
        response = requests.get(f"{BASE_URL}/api/questions/by-id/{question_id}")
        
        assert response.status_code == 200, f"Failed to get question by ID: {response.text}"
        
        question = response.json()
        
        # Verify batch info is present
        assert "batch_name" in question, "batch_name field missing from response"
        assert "batch_date" in question, "batch_date field missing from response"
        
        # Verify batch_name is not "Desconocido" (Unknown)
        assert question["batch_name"] is not None, "batch_name should not be None"
        assert question["batch_name"] != "Desconocido", "batch_name should not be 'Desconocido'"
        
        # Verify we got the expected batch name
        assert question["batch_name"] == "Hasta 28-02-26", f"Expected 'Hasta 28-02-26', got '{question['batch_name']}'"
        
        print(f"SUCCESS: Question {question_id[:8]}... has batch_name='{question['batch_name']}' and batch_date='{question['batch_date']}'")
    
    def test_duplicate_question_by_id_has_batch_info(self):
        """Verify that a question marked as duplicate has batch info when fetched by ID"""
        # Get questions from the batch
        response = requests.get(f"{BASE_URL}/api/questions", params={"batch_id": BATCH_WITH_DUPLICATES, "include_greetings": "true"})
        assert response.status_code == 200
        
        questions = response.json()
        
        # Find a question that is marked as duplicate
        duplicate_question = next((q for q in questions if q.get("is_duplicate") and q.get("duplicate_of")), None)
        
        if duplicate_question is None:
            pytest.skip("No duplicate questions found in the batch")
        
        question_id = duplicate_question["id"]
        original_id = duplicate_question["duplicate_of"]
        
        # Test both the duplicate and original questions
        for qid, label in [(question_id, "duplicate"), (original_id, "original")]:
            response = requests.get(f"{BASE_URL}/api/questions/by-id/{qid}")
            assert response.status_code == 200, f"Failed to get {label} question by ID: {response.text}"
            
            question = response.json()
            assert "batch_name" in question, f"batch_name missing from {label} question"
            assert "batch_date" in question, f"batch_date missing from {label} question"
            assert question["batch_name"] is not None, f"batch_name is None for {label} question"
            
            print(f"SUCCESS: {label.capitalize()} question {qid[:8]}... has batch_name='{question['batch_name']}'")
    
    def test_question_not_found_returns_404(self):
        """Verify that non-existent question returns 404"""
        response = requests.get(f"{BASE_URL}/api/questions/by-id/non-existent-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Non-existent question returns 404 as expected")


class TestAIDuplicateCheckBatchInfo:
    """Test that AI duplicate check returns batch info for original questions"""
    
    def test_check_duplicates_endpoint_returns_batch_info(self):
        """Verify the non-AI duplicate check returns batch info in original_question"""
        response = requests.post(f"{BASE_URL}/api/questions/check-duplicates/{BATCH_WITH_DUPLICATES}")
        assert response.status_code == 200, f"Failed to check duplicates: {response.text}"
        
        data = response.json()
        
        # If there are duplicates found, check the structure
        if data["duplicates_count"] > 0:
            for dup in data["duplicates"]:
                # New question should have batch_id (it's from current batch)
                assert "new_question" in dup
                assert "original_question" in dup
                
                # Original question should have batch info if it's from history
                original = dup["original_question"]
                if dup["type"] == "in_history":
                    assert "batch_name" in original or "batch_date" in original, \
                        f"Historical duplicate original should have batch info: {original}"
                    print(f"SUCCESS: Duplicate has batch info - batch_name: {original.get('batch_name')}")
        else:
            print("INFO: No duplicates found (this is ok, just means data is clean)")


class TestBatchesEndpoint:
    """Verify batch data is available"""
    
    def test_batches_have_name_field(self):
        """Verify batches endpoint returns name field"""
        response = requests.get(f"{BASE_URL}/api/batches")
        assert response.status_code == 200
        
        batches = response.json()
        assert len(batches) > 0, "No batches found"
        
        for batch in batches:
            assert "id" in batch
            assert "created_at" in batch
            # name can be None but the field should exist
            assert "name" in batch or batch.get("name") is None
            
            if batch["name"]:
                print(f"SUCCESS: Batch {batch['id'][:8]}... has name='{batch['name']}'")


class TestQuestionSearchBatchInfo:
    """Test that question search returns batch info"""
    
    def test_search_returns_batch_info(self):
        """Verify search endpoint includes batch info"""
        response = requests.get(f"{BASE_URL}/api/questions/search", params={"q": "pastor"})
        assert response.status_code == 200, f"Search failed: {response.text}"
        
        data = response.json()
        
        if data["count"] > 0:
            result = data["results"][0]
            # batch_date and batch_name should be included
            assert "batch_date" in result or "batch_name" in result, \
                f"Search result missing batch info: {result}"
            print(f"SUCCESS: Search result has batch info - batch_name: {result.get('batch_name')}, batch_date: {result.get('batch_date')}")
        else:
            print("INFO: No search results (try different query)")


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
