require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const compareFaces = async (livePhotoPath, idPhotoPath) => {
  try {
    console.log('📸 Comparing photos...');
    
    // Use the vision model
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });
    
    // Read images and convert to base64
    const livePhotoBase64 = fs.readFileSync(livePhotoPath, { encoding: 'base64' });
    const idPhotoBase64 = fs.readFileSync(idPhotoPath, { encoding: 'base64' });
    
    const prompt = `You are an expert identity verification system. Compare these two images:

IMAGE 1: Live photo taken now (selfie)
IMAGE 2: ID document photo

Analyze carefully and provide a JSON response with:
1. matchScore: number 0-100 (confidence they are the same person)
2. isSamePerson: boolean
3. matchingFeatures: array of features that match (like "eye shape", "nose structure", "face shape")
4. concerns: array of any discrepancies (like "age difference", "facial hair", "lighting differences")
5. explanation: brief explanation of your decision

Be strict - only return valid JSON.`;
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: livePhotoBase64
        }
      },
      {
        inlineData: {
          mimeType: "image/jpeg", 
          data: idPhotoBase64
        }
      }
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    // Try to parse JSON from the response
    try {
      // Extract JSON if it's wrapped in markdown code blocks
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/{[\s\S]*}/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
      return JSON.parse(jsonStr);
    } catch (e) {
      console.log('Raw response:', text);
      return {
        matchScore: 0,
        isSamePerson: false,
        matchingFeatures: [],
        concerns: ['Failed to parse AI response'],
        explanation: text.substring(0, 200)
      };
    }
  } catch (error) {
    console.error('❌ Face comparison error:', error);
    throw error;
  }
};

const generateInterviewQuestions = async (role, skills, experience, questionCount = 5) => {
  try {
    const model = genAI.getGenerativeModel({ model: "models/gemini-2.5-flash" });
    const prompt = `Generate ${questionCount} technical interview questions for a ${role} position.

Candidate skills: ${skills.join(', ')}
Experience level: ${experience}

Return a JSON array with objects containing:
- id: number
- question: the interview question text
- category: "technical" or "behavioral" or "problem-solving"
- expectedKeywords: array of key terms to look for in answers

Only return valid JSON, no other text.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[[\s\S]*\]/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
    return JSON.parse(jsonStr);
    
  } catch (error) {
    console.error('❌ Question generation error:', error);
    // Return default questions if AI fails
    return [
      { id: 1, question: "Tell me about yourself and your experience.", category: "behavioral", expectedKeywords: ["experience", "skills"] },
      { id: 2, question: "What are your greatest strengths and weaknesses?", category: "behavioral", expectedKeywords: ["strengths", "weaknesses"] },
      { id: 3, question: "Describe a challenging project you worked on.", category: "problem-solving", expectedKeywords: ["challenge", "solution"] }
    ];
  }
};

module.exports = { compareFaces, generateInterviewQuestions };