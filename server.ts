import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { DbStore } from './src/db/dbStore.js';
import { ParsedResume, AssessmentState } from './src/types.js';
import { 
  parseAndScreenResume, 
  matchCandidateProfile, 
  generateCodingQuestion, 
  evaluateCodingSubmission, 
  generateInterviewQuestions, 
  evaluateInterviewAnswers, 
  evaluateCommunicationSkill 
} from './src/services/aiService.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // Helper: Simple Authentication Middleware
  const getAuthUser = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    
    const db = DbStore.get();
    return db.users.find(u => u.id === token) || null;
  };

  // ==========================================
  // AUTHENTICATION APIs
  // ==========================================

  app.post('/api/auth/register', (req, res) => {
    const { email, password, name, role, company } = req.body;
    if (!email || !name || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required.' });
    }

    const db = DbStore.get();
    if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const userId = 'u-' + Math.random().toString(36).substr(2, 6);
    const newUser = { id: userId, email, name, role, createdAt: new Date().toISOString() };

    DbStore.update(database => {
      database.users.push(newUser);
      if (role === 'recruiter') {
        database.recruiters.push({
          id: 'r-' + Math.random().toString(36).substr(2, 6),
          userId,
          name,
          company: company || 'Self-Employed'
        });
      } else if (role === 'candidate') {
        database.candidates.push({
          id: 'c-' + Math.random().toString(36).substr(2, 6),
          userId,
          name,
          email,
          phone: '',
          skills: [],
          experienceYears: 0,
          education: '',
          projects: [],
          github: '',
          linkedin: '',
          status: 'applied'
        });
      }
    });

    res.json({ token: userId, user: newUser });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const db = DbStore.get();
    const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    // In a real application, you would check password here. Since this is a demo,
    // we bypass it to allow quick access with the standard 'password' credential.
    res.json({ token: user.id, user });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user });
  });


  // ==========================================
  // JOB MANAGEMENT APIs
  // ==========================================

  app.get('/api/jobs', (req, res) => {
    const db = DbStore.get();
    res.json(db.jobs);
  });

  app.get('/api/jobs/:id', (req, res) => {
    const db = DbStore.get();
    const job = db.jobs.find(j => j.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  app.post('/api/jobs', (req, res) => {
    const user = getAuthUser(req);
    if (!user || (user.role !== 'recruiter' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, department, location, type, description, requirements, salary } = req.body;
    if (!title || !description || !requirements) {
      return res.status(400).json({ error: 'Missing required job parameters.' });
    }

    const newJob = {
      id: 'j-' + Math.random().toString(36).substr(2, 6),
      title,
      department,
      location,
      type,
      description,
      requirements: Array.isArray(requirements) ? requirements : requirements.split(',').map((r: string) => r.trim()),
      salary,
      status: 'open' as const,
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    DbStore.update(database => {
      database.jobs.unshift(newJob);
    });

    res.json(newJob);
  });

  app.put('/api/jobs/:id', (req, res) => {
    const user = getAuthUser(req);
    if (!user || (user.role !== 'recruiter' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, department, location, type, description, requirements, salary, status } = req.body;

    let updatedJob: any = null;
    DbStore.update(database => {
      const idx = database.jobs.findIndex(j => j.id === req.params.id);
      if (idx !== -1) {
        database.jobs[idx] = {
          ...database.jobs[idx],
          title: title || database.jobs[idx].title,
          department: department || database.jobs[idx].department,
          location: location || database.jobs[idx].location,
          type: type || database.jobs[idx].type,
          description: description || database.jobs[idx].description,
          requirements: requirements ? (Array.isArray(requirements) ? requirements : requirements.split(',').map((r: string) => r.trim())) : database.jobs[idx].requirements,
          salary: salary || database.jobs[idx].salary,
          status: status || database.jobs[idx].status,
        };
        updatedJob = database.jobs[idx];
      }
    });

    if (!updatedJob) return res.status(404).json({ error: 'Job not found' });
    res.json(updatedJob);
  });

  app.delete('/api/jobs/:id', (req, res) => {
    const user = getAuthUser(req);
    if (!user || (user.role !== 'recruiter' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    DbStore.update(database => {
      database.jobs = database.jobs.filter(j => j.id !== req.params.id);
    });

    res.json({ success: true });
  });


  // ==========================================
  // CANDIDATE & RESUME UPLOAD APIs
  // ==========================================

  app.get('/api/candidates', (req, res) => {
    const db = DbStore.get();
    res.json(db.candidates);
  });

  app.get('/api/candidates/profile', (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'candidate') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = DbStore.get();
    const candidate = db.candidates.find(c => c.userId === user.id);
    res.json(candidate || null);
  });

  app.put('/api/candidates/profile', (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'candidate') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { phone, github, linkedin, skills, education, projects } = req.body;

    let updatedCandidate: any = null;
    DbStore.update(database => {
      const idx = database.candidates.findIndex(c => c.userId === user.id);
      if (idx !== -1) {
        database.candidates[idx] = {
          ...database.candidates[idx],
          phone: phone ?? database.candidates[idx].phone,
          github: github ?? database.candidates[idx].github,
          linkedin: linkedin ?? database.candidates[idx].linkedin,
          skills: skills ?? database.candidates[idx].skills,
          education: education ?? database.candidates[idx].education,
          projects: projects ?? database.candidates[idx].projects,
        };
        updatedCandidate = database.candidates[idx];
      }
    });

    res.json(updatedCandidate);
  });

  // Action: Recruiter changes candidate status
  app.post('/api/candidates/action', (req, res) => {
    const user = getAuthUser(req);
    if (!user || (user.role !== 'recruiter' && user.role !== 'admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { candidateId, status } = req.body;
    if (!candidateId || !status) return res.status(400).json({ error: 'Missing candidateId or status' });

    DbStore.update(database => {
      const cIdx = database.candidates.findIndex(c => c.id === candidateId);
      if (cIdx !== -1) {
        database.candidates[cIdx].status = status;
      }
      
      // Update associated applications to reflect shortlist/reject
      database.applications.forEach(app => {
        if (app.candidateId === candidateId) {
          app.status = status === 'shortlisted' ? 'shortlisted' : status === 'rejected' ? 'rejected' : 'applied';
        }
      });
    });

    res.json({ success: true });
  });

  // Upload Resume & Trigger Parsing Agent
  app.post('/api/candidates/upload-resume', async (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'candidate') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { resumeText, jobId } = req.body;
    if (!resumeText) {
      return res.status(400).json({ error: 'Resume text or content is required.' });
    }

    const db = DbStore.get();
    const job = db.jobs.find(j => j.id === jobId) || db.jobs[0];
    const jobDesc = job ? `${job.title}: ${job.description}` : "General Engineering Role";

    try {
      // Trigger screening and parsing agents!
      const evaluation = await parseAndScreenResume(resumeText, jobDesc);

      let activeCandidateId = '';
      DbStore.update(database => {
        const cIdx = database.candidates.findIndex(c => c.userId === user.id);
        if (cIdx !== -1) {
          database.candidates[cIdx] = {
            ...database.candidates[cIdx],
            name: evaluation.parsed.name || database.candidates[cIdx].name,
            email: evaluation.parsed.email || database.candidates[cIdx].email,
            phone: evaluation.parsed.phone || database.candidates[cIdx].phone,
            skills: evaluation.parsed.skills.length ? evaluation.parsed.skills : database.candidates[cIdx].skills,
            experienceYears: evaluation.parsed.experienceYears || database.candidates[cIdx].experienceYears,
            education: evaluation.parsed.education || database.candidates[cIdx].education,
            projects: evaluation.parsed.projects.length ? evaluation.parsed.projects : database.candidates[cIdx].projects,
            github: evaluation.parsed.github || database.candidates[cIdx].github,
            linkedin: evaluation.parsed.linkedin || database.candidates[cIdx].linkedin,
            resumeUrl: 'Uploaded File Content'
          };
          activeCandidateId = database.candidates[cIdx].id;
        }
      });

      // Automatically apply candidate to the job if jobId was passed
      if (jobId && activeCandidateId) {
        const existingApp = db.applications.find(a => a.jobId === jobId && a.candidateId === activeCandidateId);
        if (!existingApp) {
          const matching = await matchCandidateProfile(evaluation.parsed, jobDesc);
          
          const newApp = {
            id: 'a-' + Math.random().toString(36).substr(2, 6),
            jobId,
            candidateId: activeCandidateId,
            appliedDate: new Date().toISOString(),
            status: 'applied' as const,
            aiMatchScore: matching.matchingScore,
            aiMatchExplanation: matching.overallRecommendation
          };

          DbStore.update(database => {
            database.applications.unshift(newApp);
          });
        }
      }

      res.json({ success: true, evaluation });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || 'AI Parsing failed' });
    }
  });


  // ==========================================
  // APPLICATIONS & MATCHING APIs
  // ==========================================

  app.get('/api/applications', (req, res) => {
    const db = DbStore.get();
    res.json(db.applications);
  });

  app.get('/api/applications/candidate', (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'candidate') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const db = DbStore.get();
    const candidate = db.candidates.find(c => c.userId === user.id);
    if (!candidate) return res.json([]);

    const apps = db.applications.filter(a => a.candidateId === candidate.id);
    res.json(apps);
  });

  app.post('/api/applications/apply', async (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'candidate') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' });

    const db = DbStore.get();
    const candidate = db.candidates.find(c => c.userId === user.id);
    if (!candidate) return res.status(404).json({ error: 'Candidate profile not established.' });

    const existingApp = db.applications.find(a => a.jobId === jobId && a.candidateId === candidate.id);
    if (existingApp) return res.status(400).json({ error: 'Already applied for this job.' });

    const job = db.jobs.find(j => j.id === jobId);
    const jobDesc = job ? `${job.title}: ${job.description}` : "Engineering Role";

    try {
      // Trigger Candidate Matching Agent!
      const parsedResume: ParsedResume = {
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        skills: candidate.skills,
        experienceYears: candidate.experienceYears,
        education: candidate.education,
        projects: candidate.projects,
        github: candidate.github,
        linkedin: candidate.linkedin
      };

      const match = await matchCandidateProfile(parsedResume, jobDesc);

      const newApp = {
        id: 'a-' + Math.random().toString(36).substr(2, 6),
        jobId,
        candidateId: candidate.id,
        appliedDate: new Date().toISOString(),
        status: 'applied' as const,
        aiMatchScore: match.matchingScore,
        aiMatchExplanation: match.overallRecommendation
      };

      DbStore.update(database => {
        database.applications.unshift(newApp);
      });

      res.json(newApp);
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: 'AI application matching failed.' });
    }
  });


  // ==========================================
  // ASSESSMENT & INTERVIEW AGENT APIs
  // ==========================================

  app.get('/api/assessments/application/:appId', (req, res) => {
    const db = DbStore.get();
    const assessments = db.assessments.filter(a => a.applicationId === req.params.appId);
    res.json(assessments);
  });

  // Generate assessment coding question
  app.post('/api/assessments/generate-coding', async (req, res) => {
    const { applicationId, difficulty, skills } = req.body;
    if (!applicationId) return res.status(400).json({ error: 'Missing applicationId' });

    const db = DbStore.get();
    const appRecord = db.applications.find(a => a.id === applicationId);
    const job = appRecord ? db.jobs.find(j => j.id === appRecord.jobId) : null;
    const role = job ? job.title : "Software Engineer";

    try {
      const skillsArray = skills ? (Array.isArray(skills) ? skills : [skills]) : (job ? job.requirements : ['JavaScript']);
      const question = await generateCodingQuestion(role, difficulty || 'Medium', skillsArray);

      const newAssessment: AssessmentState = {
        id: 'as-' + Math.random().toString(36).substr(2, 6),
        applicationId,
        type: 'coding',
        subType: 'coding',
        questions: [question],
        answers: {},
        scores: {},
        completed: false
      };

      DbStore.update(database => {
        database.assessments.push(newAssessment);
      });

      res.json(newAssessment);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Coding challenge generation failed.' });
    }
  });

  // Submit coding assessment
  app.post('/api/assessments/submit-coding', async (req, res) => {
    const { assessmentId, questionId, submittedCode } = req.body;
    if (!assessmentId || !questionId || !submittedCode) {
      return res.status(400).json({ error: 'Missing assessmentId, questionId, or submittedCode' });
    }

    const db = DbStore.get();
    const assessment = db.assessments.find(a => a.id === assessmentId);
    if (!assessment) return res.status(404).json({ error: 'Assessment record not found' });

    const question = assessment.questions.find((q: any) => q.id === questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    try {
      // Evaluate with Coding Evaluation Agent!
      const evaluation = await evaluateCodingSubmission(question, submittedCode);

      DbStore.update(database => {
        const idx = database.assessments.findIndex(a => a.id === assessmentId);
        if (idx !== -1) {
          database.assessments[idx].answers[questionId] = submittedCode;
          database.assessments[idx].scores = evaluation;
          database.assessments[idx].completed = true;
          database.assessments[idx].score = evaluation.score;
          database.assessments[idx].feedback = evaluation.feedback;
        }
      });

      res.json(evaluation);
    } catch (e: any) {
      res.status(500).json({ error: 'AI coding grading failed.' });
    }
  });

  // Generate HR or Technical Interview questions
  app.post('/api/assessments/generate-interview', async (req, res) => {
    const { applicationId, interviewType } = req.body; // interviewType: 'hr' | 'technical'
    if (!applicationId || !interviewType) {
      return res.status(400).json({ error: 'Missing applicationId or interviewType' });
    }

    const db = DbStore.get();
    const appRecord = db.applications.find(a => a.id === applicationId);
    const candidate = appRecord ? db.candidates.find(c => c.id === appRecord.candidateId) : null;
    const skills = candidate ? candidate.skills : ['Communication', 'System Design'];

    try {
      const questions = await generateInterviewQuestions(interviewType, skills);

      const newAssessment: AssessmentState = {
        id: 'as-' + Math.random().toString(36).substr(2, 6),
        applicationId,
        type: 'interview',
        subType: interviewType,
        questions,
        answers: {},
        scores: {},
        completed: false
      };

      DbStore.update(database => {
        database.assessments.push(newAssessment);
      });

      res.json(newAssessment);
    } catch (e: any) {
      res.status(500).json({ error: 'Interview setup failed' });
    }
  });

  // Submit interview responses (evaluates answers and parses communication score)
  app.post('/api/assessments/submit-interview', async (req, res) => {
    const { assessmentId, answers } = req.body; // answers is Record<questionId, string>
    if (!assessmentId || !answers) {
      return res.status(400).json({ error: 'Missing assessmentId or answers' });
    }

    const db = DbStore.get();
    const assessment = db.assessments.find(a => a.id === assessmentId);
    if (!assessment) return res.status(404).json({ error: 'Interview not found' });

    try {
      // Evaluate answers (Interactive evaluation agent)
      const evaluation = await evaluateInterviewAnswers(assessment.subType as 'hr' | 'technical', assessment.questions, answers);

      // Evaluate overall speech traits (Communication assessment agent)
      const answerTexts = Object.values(answers) as string[];
      const communication = await evaluateCommunicationSkill(answerTexts);

      const consolidatedScore = Math.round((evaluation.overallScore + communication.overallScore) / 2);

      DbStore.update(database => {
        const idx = database.assessments.findIndex(a => a.id === assessmentId);
        if (idx !== -1) {
          database.assessments[idx].answers = answers;
          database.assessments[idx].scores = {
            evaluation,
            communication
          };
          database.assessments[idx].completed = true;
          database.assessments[idx].score = consolidatedScore;
          database.assessments[idx].feedback = `${evaluation.feedback}\n\nCommunication Feedback:\nGrammar: ${communication.grammarScore}, Fluency: ${communication.fluencyScore}.\nSuggestions: ${communication.suggestions.join(' ')}`;
        }
      });

      res.json({ evaluation, communication, consolidatedScore });
    } catch (e: any) {
      res.status(500).json({ error: 'Interview evaluation failed.' });
    }
  });


  // ==========================================
  // ADMIN & GENERAL ANALYTICS APIs
  // ==========================================

  app.get('/api/analytics/stats', (req, res) => {
    const stats = DbStore.getStats();
    res.json(stats);
  });

  app.get('/api/admin/users', (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const db = DbStore.get();
    res.json(db.users);
  });

  app.delete('/api/admin/users/:id', (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    DbStore.update(database => {
      database.users = database.users.filter(u => u.id !== req.params.id);
      database.candidates = database.candidates.filter(c => c.userId !== req.params.id);
      database.recruiters = database.recruiters.filter(r => r.userId !== req.params.id);
    });
    res.json({ success: true });
  });

  // ==========================================
  // VITE DEV SERVER / PRODUCTION SERVING
  // ==========================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TalentAI Server actively running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Critical server boot error:", err);
});
