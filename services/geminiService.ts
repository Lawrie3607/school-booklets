
import { GoogleGenAI, Type } from "@google/genai";
import { AIQuestionResponse, BookletType, Subject, Difficulty } from "../types";

/**
 * Initializes Gemini with the standard environment API Key.
 */
const getAIClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const PRO_MODEL = "gemini-3-pro-preview";
const FLASH_MODEL = "gemini-3-flash-preview";

export const processImageWithGemini = async (
  base64Images: string[],
  questionNumber: number,
  bookletType: BookletType
): Promise<AIQuestionResponse> => {
  const ai = getAIClient();
  const parts = base64Images.map(base64 => ({
    inlineData: { mimeType: "image/jpeg", data: base64.replace(/^data:image\/\w+;base64,/, "") }
  }));
  
  const promptText = `
    Analyze this exam question image(s). 
    This is Question ${questionNumber}.
    
    1. Extract all text accurately.
    2. Solve the problem completely. Use LaTeX for math ($...$).
    3. Determine the Mark Allocation (usually in brackets at the end).
    4. Categorize difficulty (Knowledge, Routine, Complex, Problem Solving).
    
    Respond strictly in JSON format.
  `;

  try {
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: { parts: [...parts, { text: promptText }] },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questionText: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            totalMarks: { type: Type.INTEGER },
            solution: { type: Type.STRING }
          },
          required: ["questionText", "difficulty", "totalMarks", "solution"]
        }
      }
    });
    
    const data = JSON.parse(response.text || "{}");
    return {
      questionText: data.questionText || "Extraction failed.", 
      solutionMarkdown: data.solution || "Solution failed.",
      difficulty: (data.difficulty as Difficulty) || Difficulty.LEVEL_2,
      totalMarks: data.totalMarks || 5,
      requiresImage: true
    };
  } catch (error: any) { 
    console.error("AI Processing Error:", error);
    return { 
      questionText: "Processing Error", 
      solutionMarkdown: `System could not process: ${error.message}`, 
      difficulty: Difficulty.LEVEL_1, 
      totalMarks: 0, 
      requiresImage: true, 
      error: error.message 
    }; 
  }
};

export const markStudentWork = async (
  questionText: string,
  memoSolution: string,
  studentResponse: string,
  maxMarks: number,
  studentImagePath?: string
): Promise<{ score: number, maxScore: number, feedback: string }> => {
  const ai = getAIClient();
  const parts: any[] = [{ text: `
    Grade this student's answer out of ${maxMarks}.
    
    Question: ${questionText}
    Memorandum: ${memoSolution}
    Student Submission: ${studentResponse}
    
    Provide feedback and a numeric score in JSON.
  ` }];
  
  if (studentImagePath) {
    parts.push({ inlineData: { mimeType: "image/jpeg", data: studentImagePath.replace(/^data:image\/\w+;base64,/, "") } });
  }

  try {
    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: { parts },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            maxScore: { type: Type.INTEGER },
            feedback: { type: Type.STRING }
          },
          required: ["score", "maxScore", "feedback"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (err) { 
    return { score: 0, maxScore: maxMarks, feedback: "AI Marking unavailable." }; 
  }
};

export const extractLibraryFromJsonOrCode = async (content: string, fileName: string): Promise<string> => {
  // If it's a code file, we try to strip the JS parts locally first (in storageService)
  // But if that fails, we use Flash to find the JSON structure.
  const ai = getAIClient();
  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: `Find and extract the large JSON object starting with "booklets" from this text: \n\n ${content.substring(0, 5000)}`,
      config: { 
        responseMimeType: "application/json",
        systemInstruction: "You are a data recovery tool. Find the JSON core of the provided text and return it."
      }
    });
    return response.text || "{}";
  } catch (e) {
    return "{}";
  }
};
