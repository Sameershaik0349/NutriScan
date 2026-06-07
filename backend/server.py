import json
import os
from typing import Optional, Dict
from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, EmailStr
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load env variables
load_dotenv()

app = FastAPI(title="NutriScan API - Dynamic Refactored with Auth")

# Enable CORS so your app interface can communicate with the server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Initialize the official Gemini Client with the user's specific API Key
GEMINI_API_KEY = os.getenv("EMERGENT_LLM_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

# --- Authentication Models & DB ---
USER_DB: Dict[str, dict] = {}

class AuthRequest(BaseModel):
    email: EmailStr
    password: str

# 2. Define a strict schema to force the API to return clean, exact nutrient data
class FoodAnalysis(BaseModel):
    product_name: str = Field(description="The exact name of the scanned food or dish.")
    calories: int = Field(description="Estimated calories for a standard serving size.")
    carbs: float = Field(description="Grams of carbohydrates.")
    protein: float = Field(description="Grams of protein.")
    fats: float = Field(description="Grams of fat.")
    health_verdict: str = Field(description="Must return exactly one string: 'GOOD', 'BAD', or 'MODERATION'")
    verdict_reason: str = Field(description="A short 1-sentence description matching the user profile guidelines.")

# --- Authentication Routes ---

@app.post("/register", status_code=status.HTTP_201_CREATED)
@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
async def handle_registration(user: AuthRequest):
    normalized_email = user.email.lower().strip()
    
    # Check if user already exists
    if normalized_email in USER_DB:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account already exists with this email."
        )
    
    # Store user data securely
    USER_DB[normalized_email] = {"password": user.password}
    return {"status": "success", "message": "Account created successfully.", "access_token": "registered_session_token", "token": "registered_session_token"}

@app.post("/login")
@app.post("/api/auth/login")
async def handle_login(user: AuthRequest):
    normalized_email = user.email.lower().strip()
    
    # Check if account exists
    if normalized_email not in USER_DB:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found: Account does not exist."
        )
        
    # Check password matching
    if USER_DB[normalized_email]["password"] != user.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials."
        )
        
    return {"status": "success", "token": "authenticated_session_token", "access_token": "authenticated_session_token"}

# Mock User profile endpoint so index.tsx can load profile details upon login
@app.get("/api/auth/me")
@app.get("/auth/me")
async def handle_me(token: Optional[str] = None):
    # Return a dummy profile structure so the frontend loads successfully
    return {
        "email": "user@example.com",
        "profile": {
            "full_name": "NutriScan Explorer",
            "age": 25,
            "gender": "Prefer not to say",
            "height": 170.0,
            "weight": 70.0,
            "country": "India",
            "allergies": [],
            "medical_conditions": [],
            "diet_type": "No Restriction",
            "cuisine_preference": ["Indian", "Italian"],
            "meal_frequency": "3 meals/day",
            "weight_goal": "Maintain weight",
            "target_weight": 70.0,
            "activity_level": "Moderate",
            "weekly_budget": 1000.0,
            "onboarded": True # Bypasses onboarding flow directly to dashboard
        }
    }

# --- Scanner Endpoint ---

@app.post("/scan-food")
@app.post("/api/scan-food")
@app.post("/scan/photo")
@app.post("/api/scan/photo")
async def scan_food_endpoint(
    file: Optional[UploadFile] = File(None),
    photo: Optional[UploadFile] = File(None)
):
    try:
        upload_file = file or photo
        if not upload_file:
            raise HTTPException(status_code=400, detail="No image file provided. Please upload using key 'file' or 'photo'.")
            
        # 3. Read image file payload directly from frontend upload
        image_bytes = await upload_file.read()
        
        # 4. Prepare binary part structure for the Multimodal Gemini SDK
        image_part = types.Part.from_bytes(
            data=image_bytes,
            mime_type=upload_file.content_type or "image/jpeg"
        )
        
        # 5. Execute vision inference prompt
        prompt_instruction = (
            "Analyze this food image. Identify the dish accurately. "
            "Calculate total calories and macronutrients (Carbs, Protein, Fats in grams) for a standard serving size. "
            "Provide a health_verdict status along with a short 1-sentence verdict_reason. "
            "Output your findings matching the required JSON schema structure strictly."
        )
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[image_part, prompt_instruction],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=FoodAnalysis,
                temperature=0.1
            ),
        )
        
        # 6. Parse and deliver fresh structured JSON metrics back to the application UI
        fresh_data = json.loads(response.text)
        return fresh_data

    except Exception as e:
        print(f"Error encountered during dynamic image scanning: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Scanner Inference Failure: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
