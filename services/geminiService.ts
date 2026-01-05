
import { GoogleGenAI, Type } from "@google/genai";
import { AIQuestionResponse, BookletType, Subject, Difficulty } from "../types";

/**
 * Initializes Gemini with the standard environment API Key.
 */
const getAIClient = () => {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!key || key === 'PLACEHOLDER_API_KEY') {
    // Don't throw here to avoid uncaught exceptions in renderer code paths.
    // Return a stub client that surfaces a clear error when used.
    return {
      models: {
        generateContent: async () => {
          throw new Error(
            "Gemini API Key is missing. Set GEMINI_API_KEY in your environment or .env.local file."
          );
        }
      }
    } as any;
  }
  return new GoogleGenAI({ apiKey: key });
};

const PRO_MODEL = "gemini-3-pro-preview";
const FLASH_MODEL = "gemini-3-flash-preview";

/**
 * AI Agent to optimize and unify a booklet's content.
 */
export const optimizeBookletContent = async (
  bookletTitle: string,
  questions: any[]
): Promise<any[]> => {
  const ai = getAIClient();
  const promptText = `
    You are an expert educational content editor. 
    Optimize the following questions for a booklet titled "${bookletTitle}".
    
    Tasks:
    1. Unify the formatting: Use consistent LaTeX for all math ($...$).
    2. Improve clarity: Rephrase questions to be clear and professional.
    3. Standardize solutions: Ensure every solution is step-by-step and detailed.
    4. Uniform Marks: Ensure mark allocations are consistent (e.g., "[5 marks]" at the end).
    
    Questions to optimize:
    ${JSON.stringify(questions.map(q => ({ id: q.id, text: q.extractedQuestion, solution: q.generatedSolution, marks: q.maxMarks })))}
    
    Respond strictly in JSON format as an array of objects with the same IDs.
  `;

  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: { parts: [{ text: promptText }] },
      config: { 
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              extractedQuestion: { type: Type.STRING },
              generatedSolution: { type: Type.STRING },
              maxMarks: { type: Type.INTEGER }
            },
            required: ["id", "extractedQuestion", "generatedSolution", "maxMarks"]
          }
        }
      }
    });
    
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Optimization Error:", error);
    return questions;
  }
};

/**
 * AI Agent to format a single piece of text (question or solution).
 */
export const formatTextWithAI = async (
  text: string,
  context: 'question' | 'solution'
): Promise<string> => {
  const ai = getAIClient();
  const promptText = `
    Format the following ${context} text to be professional and uniform.
    - Use $...$ for all mathematical symbols and equations.
    - Ensure clear structure and professional tone.
    - If it's a solution, make it step-by-step.
    
    Text to format:
    ${text}
    
    Respond with ONLY the formatted text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: { parts: [{ text: promptText }] }
    });
    
    return response.text || text;
  } catch (error) {
    console.error("Formatting Error:", error);
    return text;
  }
};

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
    
    Uniformity Rules:
    - Use $...$ for all mathematical symbols and equations.
    - Ensure the question text is clear and professional.
    - The solution must be step-by-step.
    
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
