import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import openai from '../utils/openai.js';
import PDFParser from 'pdf2json';
import fs from 'fs';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());


const extractTextFromPDF = (filePath) => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        
        pdfParser.on('pdfParser_dataError', (errData) => reject(errData.parserError));
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
            const extractedText = pdfParser.getRawTextContent();
            resolve(extractedText);
        });

        pdfParser.loadPDF(filePath);
    });
};



// Resume analysis endpoint
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a resume file.' });
        }

        const filePath = path.resolve(req.file.path);
        const resumeText = await extractTextFromPDF(filePath);

        const { jobDescription } = req.body;

        if (!jobDescription) {
            return res.status(400).json({ error: 'Job description is required.' });
        }

        // AI prompt for resume evaluation
        const prompt = `You are an expert resume reviewer. Evaluate the following resume based on the provided job description 
and respond strictly in valid JSON format with exactly the following structure:

{
  "summary": "brief summary of the resume evaluation",
  "missingSkills": ["skill1", "skill2"],
  "recommendations": ["recommendation1", "recommendation2"],
  "score": 0-100
}

Resume:
${resumeText}

Job Description:
${jobDescription}

Do not include any additional text outside the JSON format.
`;

        const aiResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert resume reviewer. Always respond in JSON format.',
                },
                {
                    role: 'user',
                    content: prompt,
                }
            ],
            max_tokens: 500,
        });

        fs.unlinkSync(filePath);

        let feedback = aiResponse.choices[0]?.message?.content.trim();
        let updatedFeedback;
        const jsonStart = feedback.indexOf('{');
        const jsonEnd = feedback.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = feedback.substring(jsonStart, jsonEnd + 1);
            updatedFeedback = JSON.parse(jsonString);
    
            
        } else {
            throw new Error("Invalid JSON format received from AI.");
        }

        res.json({ feedback: updatedFeedback});
    } catch (error) {
        console.error('Error analyzing resume:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
