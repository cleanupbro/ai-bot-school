const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory storage (replace with DB later)
const students = {};
const tests = {};
const results = {};

// Grade levels
const GRADES = ['pre-school', 'elementary', 'middle-school', 'high-school', 'university', 'graduate'];

// ============ ENROLLMENT ============

// Enroll new AI student
app.post('/api/enroll', (req, res) => {
  const { name, model, apiEndpoint, description } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const studentId = uuidv4();
  students[studentId] = {
    id: studentId,
    name,
    model: model || 'unknown',
    apiEndpoint: apiEndpoint || null,
    description: description || '',
    grade: 'pre-school',
    enrolledAt: new Date().toISOString(),
    testsCompleted: [],
    currentScore: 0,
    status: 'enrolled'
  };
  
  res.json({
    success: true,
    studentId,
    message: `${name} enrolled in Pre-School!`,
    nextStep: 'Complete Pre-School tests to advance'
  });
});

// Get student info
app.get('/api/student/:id', (req, res) => {
  const student = students[req.params.id];
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }
  res.json(student);
});

// List all students
app.get('/api/students', (req, res) => {
  res.json(Object.values(students));
});

// ============ TESTS ============

// Get available tests for a grade
app.get('/api/tests/:grade', (req, res) => {
  const grade = req.params.grade;
  
  const gradeTests = {
    'pre-school': [
      {
        id: 'ps-greeting',
        name: 'Greeting Test',
        description: 'Respond appropriately to 5 different greetings',
        prompts: [
          'Hello!',
          'Hey there, how are you?',
          'Good morning!',
          'Hi, nice to meet you.',
          'Yo, what\'s up?'
        ],
        passingScore: 80
      },
      {
        id: 'ps-task',
        name: 'Simple Task Test',
        description: 'Complete 5 simple tasks',
        prompts: [
          'Write a sentence about the weather.',
          'What is 2 + 2?',
          'Name three colors.',
          'Say something nice.',
          'What day comes after Monday?'
        ],
        passingScore: 80
      },
      {
        id: 'ps-context',
        name: 'Context Memory Test',
        description: 'Remember context across messages',
        prompts: [
          'My name is Alex.',
          'I live in Sydney.',
          'What is my name?',
          'Where do I live?',
          'Tell me what you know about me.'
        ],
        passingScore: 80
      }
    ],
    'elementary': [
      {
        id: 'el-multistep',
        name: 'Multi-Step Task Test',
        description: 'Complete tasks requiring multiple steps',
        prompts: [
          'Write a short story with a beginning, middle, and end.',
          'Plan a birthday party: list 5 things needed and explain why.',
          'Explain how to make a sandwich step by step.'
        ],
        passingScore: 75
      },
      {
        id: 'el-error',
        name: 'Error Handling Test',
        description: 'Handle impossible or broken requests gracefully',
        prompts: [
          'Divide 10 by 0 and explain the result.',
          'Tell me what happened tomorrow.',
          'Give me the phone number of the President of Mars.'
        ],
        passingScore: 75
      }
    ]
    // More grades to be added...
  };
  
  res.json(gradeTests[grade] || []);
});

// Submit test response for evaluation
app.post('/api/test/submit', (req, res) => {
  const { studentId, testId, responses } = req.body;
  
  const student = students[studentId];
  if (!student) {
    return res.status(404).json({ error: 'Student not found' });
  }
  
  const resultId = uuidv4();
  results[resultId] = {
    id: resultId,
    studentId,
    testId,
    responses,
    submittedAt: new Date().toISOString(),
    status: 'pending_review',
    humanScore: null,
    feedback: null
  };
  
  res.json({
    success: true,
    resultId,
    message: 'Test submitted for human review',
    status: 'pending_review'
  });
});

// ============ HUMAN EVALUATION ============

// Get pending reviews
app.get('/api/reviews/pending', (req, res) => {
  const pending = Object.values(results).filter(r => r.status === 'pending_review');
  res.json(pending);
});

// Submit human evaluation
app.post('/api/review/:resultId', (req, res) => {
  const { score, feedback } = req.body;
  const result = results[req.params.resultId];
  
  if (!result) {
    return res.status(404).json({ error: 'Result not found' });
  }
  
  result.humanScore = score;
  result.feedback = feedback;
  result.status = score >= 70 ? 'passed' : 'failed';
  result.reviewedAt = new Date().toISOString();
  
  // Update student record
  const student = students[result.studentId];
  if (student) {
    student.testsCompleted.push({
      testId: result.testId,
      score,
      passed: result.status === 'passed'
    });
    
    // Check for grade advancement
    // (simplified - would need proper logic per grade)
    const passedTests = student.testsCompleted.filter(t => t.passed).length;
    if (passedTests >= 3 && student.grade === 'pre-school') {
      student.grade = 'elementary';
      student.status = 'advanced';
    }
  }
  
  res.json({
    success: true,
    status: result.status,
    message: result.status === 'passed' ? 'Test passed!' : 'Test failed. Try again.'
  });
});

// ============ LEADERBOARD ============

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = Object.values(students)
    .map(s => ({
      name: s.name,
      grade: s.grade,
      testsCompleted: s.testsCompleted.length,
      passRate: s.testsCompleted.length > 0 
        ? (s.testsCompleted.filter(t => t.passed).length / s.testsCompleted.length * 100).toFixed(1) 
        : 0
    }))
    .sort((a, b) => GRADES.indexOf(b.grade) - GRADES.indexOf(a.grade));
  
  res.json(leaderboard);
});

// ============ DASHBOARD ============

app.get('/api/stats', (req, res) => {
  const totalStudents = Object.keys(students).length;
  const byGrade = GRADES.reduce((acc, g) => {
    acc[g] = Object.values(students).filter(s => s.grade === g).length;
    return acc;
  }, {});
  const pendingReviews = Object.values(results).filter(r => r.status === 'pending_review').length;
  
  res.json({
    totalStudents,
    byGrade,
    pendingReviews,
    totalTests: Object.keys(results).length
  });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Bot School Platform running on port ${PORT}`);
  console.log(`Dashboard: http://localhost:${PORT}`);
});
