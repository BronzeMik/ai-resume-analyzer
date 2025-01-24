import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import cors from 'cors';
import openai from '../../utils/openai.js';
import PDFParser from 'pdf2json';

dotenv.config();

const app = express();

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

app.use(cors());
app.use(express.json());

// Function to extract text from PDF buffer
const extractTextFromPDFBuffer = (buffer) => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();

        pdfParser.on('pdfParser_dataError', (errData) => reject(errData.parserError));
        pdfParser.on('pdfParser_dataReady', (pdfData) => {
            const extractedText = pdfParser.getRawTextContent();
            resolve(extractedText);
        });

        pdfParser.parseBuffer(buffer);
    });
};

// Root route
app.get('/', (req, res) => {
    res.send('Server is running');
});

// Resume analysis endpoint
app.post('/api/analyze', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a resume file.' });
        }

        // Extract text from PDF buffer
        const resumeText = await extractTextFromPDFBuffer(req.file.buffer);

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
        If the score is less than 75, provide at least 5 missing skills and 5 recommendations.
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

        let feedback = aiResponse.choices[0]?.message?.content.trim();
        
        // Extract JSON content safely
        const jsonStart = feedback.indexOf('{');
        const jsonEnd = feedback.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = feedback.substring(jsonStart, jsonEnd + 1);
            const updatedFeedback = JSON.parse(jsonString);
            res.json({ feedback: updatedFeedback });
        } else {
            throw new Error('Invalid JSON format received from AI.');
        }

    } catch (error) {
        console.error('Error analyzing resume:', error);
        res.status(500).json({ error: 'An error occurred while processing your request.' });
    }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
