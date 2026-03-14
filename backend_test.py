import requests
import sys
from datetime import datetime
import json

class YouTubeQAAPITester:
    def __init__(self, base_url="https://question-distributor.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.batch_id = None
        self.question_ids = []
        self.user_id = None
        self.program_ids = []

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json() if response.text else {}
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Response: {error_detail}")
                except:
                    print(f"   Response: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_api(self):
        """Test root API endpoint"""
        success, response = self.run_test(
            "Root API",
            "GET",
            "",
            200
        )
        return success

    def test_get_stats(self):
        """Test getting stats"""
        success, response = self.run_test(
            "Get Stats",
            "GET",
            "stats",
            200
        )
        if success:
            required_fields = ['total_questions', 'total_users', 'total_batches', 'recent_questions']
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing field: {field}")
                    return False
        return success

    def test_settings_get(self):
        """Test getting settings"""
        success, response = self.run_test(
            "Get Settings",
            "GET",
            "settings",
            200
        )
        return success

    def test_settings_put(self):
        """Test updating settings"""
        success, response = self.run_test(
            "Update Settings",
            "PUT",
            "settings",
            200,
            data={"num_programs": 4, "max_questions_per_user_per_program": 2}
        )
        return success

    def test_import_comments(self):
        """Test importing comments"""
        sample_comments = """@usuario123 Hola, me gustaría saber cómo funciona el sistema de puntos. ¿Se pueden canjear por premios?

@maria_garcia Tengo una duda sobre el último video. ¿Podrías explicar mejor la parte de la configuración inicial?

@pedro_lopez2024 Gracias por el contenido! Mi pregunta es: ¿Cuánto tiempo tarda normalmente el proceso?"""
        
        success, response = self.run_test(
            "Import Comments",
            "POST",
            "questions/import",
            200,
            data={"raw_text": sample_comments}
        )
        if success and 'batch_id' in response:
            self.batch_id = response['batch_id']
            if 'questions' in response:
                self.question_ids = [q.get('id') for q in response['questions'] if q.get('id')]
        return success

    def test_get_questions(self):
        """Test getting questions"""
        success, response = self.run_test(
            "Get Questions",
            "GET",
            "questions",
            200,
            params={"batch_id": self.batch_id} if self.batch_id else None
        )
        return success

    def test_get_batches(self):
        """Test getting batches"""
        success, response = self.run_test(
            "Get Batches",
            "GET",
            "batches",
            200
        )
        return success

    def test_create_user_mapping(self):
        """Test creating user mapping"""
        success, response = self.run_test(
            "Create User Mapping",
            "POST",
            "users",
            200,
            data={"youtube_username": "@testuser", "real_name": "Test User"}
        )
        if success and 'id' in response:
            self.user_id = response['id']
        return success

    def test_get_user_mappings(self):
        """Test getting user mappings"""
        success, response = self.run_test(
            "Get User Mappings",
            "GET",
            "users",
            200
        )
        return success

    def test_correct_questions(self):
        """Test correcting questions with AI"""
        if not self.batch_id:
            print("⏩ Skipping - No batch available")
            return True
            
        success, response = self.run_test(
            "Correct All Questions",
            "POST",
            f"questions/correct-all/{self.batch_id}",
            200
        )
        return success

    def test_check_duplicates(self):
        """Test checking for duplicates"""
        if not self.batch_id:
            print("⏩ Skipping - No batch available")
            return True
            
        success, response = self.run_test(
            "Check Duplicates",
            "POST",
            f"questions/check-duplicates/{self.batch_id}",
            200
        )
        return success

    def test_distribute_questions(self):
        """Test distributing questions into programs"""
        if not self.batch_id:
            print("⏩ Skipping - No batch available")
            return True
            
        success, response = self.run_test(
            "Distribute Questions",
            "POST",
            "programs/distribute",
            200,
            data={"batch_id": self.batch_id, "num_programs": 4}
        )
        return success

    def test_get_programs(self):
        """Test getting programs"""
        success, response = self.run_test(
            "Get Programs",
            "GET",
            "programs",
            200,
            params={"batch_id": self.batch_id} if self.batch_id else None
        )
        if success and response and isinstance(response, list):
            self.program_ids = [p.get('id') for p in response if p.get('id')]
        return success

    def test_export_program(self):
        """Test exporting a program"""
        if not self.program_ids:
            print("⏩ Skipping - No programs available")
            return True
            
        program_id = self.program_ids[0]
        success, response = self.run_test(
            "Export Program",
            "GET",
            f"programs/{program_id}/export",
            200
        )
        return success

    def test_question_update(self):
        """Test updating a question"""
        if not self.question_ids:
            print("⏩ Skipping - No questions available")
            return True
            
        question_id = self.question_ids[0]
        success, response = self.run_test(
            "Update Question",
            "PUT",
            f"questions/{question_id}",
            200,
            data={"real_name": "Updated Test User"}
        )
        return success

    def cleanup(self):
        """Clean up test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete test batch
        if self.batch_id:
            self.run_test("Delete Test Batch", "DELETE", f"batches/{self.batch_id}", 200)
        
        # Delete test user
        if self.user_id:
            self.run_test("Delete Test User", "DELETE", f"users/{self.user_id}", 200)

def main():
    print("🚀 Starting YouTube Q&A API Testing...")
    tester = YouTubeQAAPITester()

    # Test sequence
    test_sequence = [
        tester.test_root_api,
        tester.test_get_stats,
        tester.test_settings_get,
        tester.test_settings_put,
        tester.test_import_comments,
        tester.test_get_questions,
        tester.test_get_batches,
        tester.test_create_user_mapping,
        tester.test_get_user_mappings,
        tester.test_correct_questions,
        tester.test_check_duplicates,
        tester.test_distribute_questions,
        tester.test_get_programs,
        tester.test_export_program,
        tester.test_question_update,
    ]

    critical_failures = []
    
    for test_func in test_sequence:
        if not test_func():
            critical_failures.append(test_func.__name__)

    # Cleanup
    tester.cleanup()

    # Print results
    print(f"\n📊 Test Results:")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    success_rate = (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0
    print(f"Success rate: {success_rate:.1f}%")
    
    if critical_failures:
        print(f"\n❌ Critical failures in: {', '.join(critical_failures)}")
        return 1
    
    print("\n✅ All tests completed successfully!")
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())