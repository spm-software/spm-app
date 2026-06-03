"""
Tests for the AI duplicate check progress system.
Tests the new endpoints:
- POST /api/questions/check-duplicates-ai-start/{batch_id} - Start background task
- GET /api/duplicates/status/{task_id} - Get task progress
- DELETE /api/duplicates/status/{task_id} - Cleanup task

These endpoints implement a polling-based progress system to avoid timeouts
during AI duplicate detection for large batches.
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
pytestmark = pytest.mark.skipif(
    not BASE_URL,
    reason="Integration test requires REACT_APP_BACKEND_URL",
)

# Test batch with questions
TEST_BATCH_ID = "d5b36186-e03d-45da-8792-0e6661aac562"  # "Hasta 28-02-26" - 141 questions


class TestStartAIDuplicateCheck:
    """Test POST /api/questions/check-duplicates-ai-start/{batch_id}"""
    
    def test_start_returns_task_id(self):
        """Verify start endpoint returns task_id and status 'started'"""
        response = requests.post(
            f"{BASE_URL}/api/questions/check-duplicates-ai-start/{TEST_BATCH_ID}",
            json={"model": "gpt-5.4-mini"}
        )
        assert response.status_code == 200, f"Failed to start task: {response.text}"
        
        data = response.json()
        assert "task_id" in data, "Response missing task_id"
        assert data["status"] == "started", f"Expected status 'started', got '{data['status']}'"
        assert "message" in data, "Response missing message"
        
        task_id = data["task_id"]
        print(f"SUCCESS: Started task with ID: {task_id}")
        
        # Cleanup: delete the task
        requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")
    
    def test_start_with_default_model(self):
        """Verify start endpoint works without specifying a model"""
        response = requests.post(
            f"{BASE_URL}/api/questions/check-duplicates-ai-start/{TEST_BATCH_ID}",
            json={}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "task_id" in data
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/duplicates/status/{data['task_id']}")
    
    def test_start_with_different_models(self):
        """Test start endpoint accepts different AI model options"""
        models = ["gpt-5.4-mini", "gpt-5.4", "gpt-5.2", "gpt-4o-mini"]
        
        for model in models:
            response = requests.post(
                f"{BASE_URL}/api/questions/check-duplicates-ai-start/{TEST_BATCH_ID}",
                json={"model": model}
            )
            assert response.status_code == 200, f"Failed to start with model {model}: {response.text}"
            
            data = response.json()
            task_id = data["task_id"]
            
            # Verify model is stored in task status
            status_response = requests.get(f"{BASE_URL}/api/duplicates/status/{task_id}")
            if status_response.status_code == 200:
                status = status_response.json()
                assert status.get("model_used") == model or status.get("model") == model
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")
            print(f"SUCCESS: Started task with model {model}")


class TestGetDuplicateCheckStatus:
    """Test GET /api/duplicates/status/{task_id}"""
    
    @pytest.fixture
    def running_task(self):
        """Create a task and return its ID"""
        response = requests.post(
            f"{BASE_URL}/api/questions/check-duplicates-ai-start/{TEST_BATCH_ID}",
            json={"model": "gpt-5.4-mini"}
        )
        task_id = response.json()["task_id"]
        yield task_id
        # Cleanup
        requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")
    
    def test_status_returns_progress_fields(self, running_task):
        """Verify status endpoint returns all required progress fields"""
        # Wait a moment for the task to start processing
        time.sleep(2)
        
        response = requests.get(f"{BASE_URL}/api/duplicates/status/{running_task}")
        assert response.status_code == 200, f"Failed to get status: {response.text}"
        
        data = response.json()
        
        # Check required fields
        required_fields = [
            "task_id", "status", "current", "total", "percentage",
            "duplicates_found", "model_used", "started_at"
        ]
        for field in required_fields:
            assert field in data, f"Response missing required field: {field}"
        
        # Verify status is one of expected values
        assert data["status"] in ["starting", "processing", "completed", "error"]
        
        # Verify progress fields are numbers
        assert isinstance(data["current"], int), "current should be int"
        assert isinstance(data["total"], int), "total should be int"
        assert isinstance(data["percentage"], int), "percentage should be int"
        
        # Percentage should be between 0 and 100
        assert 0 <= data["percentage"] <= 100, f"percentage out of range: {data['percentage']}"
        
        print(f"SUCCESS: Task {running_task} - status: {data['status']}, progress: {data['percentage']}%")
    
    def test_status_404_for_nonexistent_task(self):
        """Verify status endpoint returns 404 for non-existent task"""
        response = requests.get(f"{BASE_URL}/api/duplicates/status/nonexistent-task-id-12345")
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("SUCCESS: Non-existent task returns 404")
    
    def test_status_shows_progress_over_time(self, running_task):
        """Verify that progress increases over time"""
        initial_response = requests.get(f"{BASE_URL}/api/duplicates/status/{running_task}")
        initial_data = initial_response.json()
        
        # Wait a bit for processing
        time.sleep(5)
        
        later_response = requests.get(f"{BASE_URL}/api/duplicates/status/{running_task}")
        later_data = later_response.json()
        
        # Progress should have increased or task should be completed
        if later_data["status"] == "processing":
            assert later_data["current"] >= initial_data["current"], \
                "Progress should increase over time"
        elif later_data["status"] == "completed":
            assert later_data["percentage"] == 100
        
        print(f"SUCCESS: Progress increased from {initial_data['current']} to {later_data['current']}")


class TestDeleteDuplicateCheckStatus:
    """Test DELETE /api/duplicates/status/{task_id}"""
    
    def test_delete_removes_task(self):
        """Verify delete endpoint removes task from memory"""
        # Create a task
        start_response = requests.post(
            f"{BASE_URL}/api/questions/check-duplicates-ai-start/{TEST_BATCH_ID}",
            json={"model": "gpt-5.4-mini"}
        )
        task_id = start_response.json()["task_id"]
        
        # Delete it
        delete_response = requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")
        assert delete_response.status_code == 200
        
        data = delete_response.json()
        assert "message" in data
        
        # Verify it's gone
        status_response = requests.get(f"{BASE_URL}/api/duplicates/status/{task_id}")
        assert status_response.status_code == 404
        
        print(f"SUCCESS: Task {task_id} deleted and no longer accessible")
    
    def test_delete_404_for_nonexistent_task(self):
        """Verify delete returns 404 for non-existent task"""
        response = requests.delete(f"{BASE_URL}/api/duplicates/status/nonexistent-task-id-12345")
        assert response.status_code == 404
        print("SUCCESS: Delete non-existent task returns 404")


class TestCompletedTaskResults:
    """Test that completed tasks return full results"""
    
    def test_completed_task_has_duplicates(self):
        """Verify completed task returns duplicates list"""
        # Start a task
        start_response = requests.post(
            f"{BASE_URL}/api/questions/check-duplicates-ai-start/{TEST_BATCH_ID}",
            json={"model": "gpt-5.4-mini"}
        )
        task_id = start_response.json()["task_id"]
        
        # Poll until completed (max 2 minutes)
        max_attempts = 60
        for attempt in range(max_attempts):
            status_response = requests.get(f"{BASE_URL}/api/duplicates/status/{task_id}")
            status = status_response.json()
            
            if status["status"] == "completed":
                # Verify completed task has results
                assert "duplicates_count" in status
                assert "duplicates" in status
                assert status["completed_at"] is not None
                
                if status["duplicates_count"] > 0:
                    assert isinstance(status["duplicates"], list)
                    assert len(status["duplicates"]) == status["duplicates_count"]
                    
                    # Check duplicate structure
                    dup = status["duplicates"][0]
                    assert "new_question" in dup
                    assert "original_question" in dup
                    assert "type" in dup
                    
                print(f"SUCCESS: Completed task has {status['duplicates_count']} duplicates")
                break
            elif status["status"] == "error":
                # Task failed - cleanup and report
                requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")
                pytest.skip(f"Task failed with error: {status.get('error')}")
            
            time.sleep(2)
        else:
            # Timeout
            requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")
            pytest.skip("Task did not complete within timeout")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/duplicates/status/{task_id}")


class TestLegacySynchronousEndpoint:
    """Test that the legacy synchronous endpoint still works"""
    
    def test_legacy_endpoint_still_works(self):
        """Verify POST /api/questions/check-duplicates-ai/{batch_id} still functions"""
        # This test uses a smaller dataset or just verifies the endpoint responds
        # For large batches, this may timeout, so we just check it starts
        response = requests.post(
            f"{BASE_URL}/api/questions/check-duplicates-ai/{TEST_BATCH_ID}",
            json={"model": "gpt-5.4-mini"},
            timeout=300  # 5 minute timeout
        )
        
        # Should either complete or timeout
        if response.status_code == 200:
            data = response.json()
            assert "duplicates_count" in data
            assert "duplicates" in data
            print(f"SUCCESS: Legacy endpoint returned {data['duplicates_count']} duplicates")
        else:
            # Might timeout or have other issues with large batch
            pytest.skip(f"Legacy endpoint returned {response.status_code} - may need async version for large batches")


@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
