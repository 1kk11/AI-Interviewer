import { generateTailoredQuestions } from '../pipeline/retrieval.js';
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

const mockSession = {
  resumeText: `
John Doe
Software Engineer
Experience:
- Built a scalable microservices architecture using Node.js and Docker at TechCorp, reducing latency by 40%.
- Migrated legacy frontend to React.js, improving Lighthouse scores to 95+.
- Wrote CI/CD pipelines using GitHub Actions.
Skills: JavaScript, Node.js, React.js, Docker, MongoDB.
`,
  jdText: `
Senior Full Stack Developer
Responsibilities:
- Lead the development of our core web application using React and Node.js.
- Architect and implement robust REST APIs.
- Mentor junior developers and enforce code quality through code reviews.
Requirements:
- 5+ years of experience with modern JavaScript (React/Node).
- Strong understanding of system design and microservices.
- Experience with AWS (EC2, S3) and Kubernetes is a major plus.
`,
  jobTitle: 'Senior Full Stack Developer',
  companyName: 'Acme Corp'
};

// async function testOldMonolithic() { ... }
async function runComparison() {
  console.log('\\n--- RUNNING NEW MULTI-AGENT GENERATOR ---');
  const newQuestions = await generateTailoredQuestions(mockSession);
  
  console.log('\\n\\n======================================');
  console.log('NEW MULTI-AGENT QUESTIONS:');
  if (newQuestions) {
    newQuestions.forEach((q, i) => console.log(`Q${i+1}: ${q.question}`));
  }
  
  process.exit(0);
}

runComparison();
