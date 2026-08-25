import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import './FeedbackReport.css';

const CIRCUMFERENCE = 2 * Math.PI * 46; // radius = 46

export default function FeedbackReport({ feedback, onRestart }) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    if (feedback && feedback.overall_score !== undefined) {
      setTimeout(() => {
        setAnimatedScore(feedback.overall_score);
      }, 150);
    }
  }, [feedback]);

  if (!feedback) {
    return (
      <div className="feedback-report" style={{ textAlign: 'center', padding: '80px 0' }}>
        <div className="spinner" style={{ margin: '0 auto 20px', width: 32, height: 32 }}></div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Generating your evaluation report...</p>
      </div>
    );
  }

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Helper to draw a sleek header bar on a page
    const drawHeader = (title) => {
      doc.setFillColor(41, 128, 185); // Professional Blue
      doc.rect(0, 0, pageWidth, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('InterviewAI', 14, 16);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(title, pageWidth - 14, 16, { align: 'right' });
      doc.setTextColor(0, 0, 0); // Reset text color
    };

    // --- PAGE 1: Evaluation Report ---
    drawHeader('Evaluation Report');
    
    let yPos = 40;
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Candidate Performance', 14, yPos);
    
    yPos += 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Overall Score: ${feedback.overall_score}/100`, 14, yPos);
    
    yPos += 15;

    // Score Breakdown Table
    if (feedback.score_breakdown && feedback.score_breakdown.length > 0) {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(40, 40, 40);
      doc.text('Score Breakdown', 14, yPos);
      yPos += 6;
      
      const tableData = feedback.score_breakdown.map((q, i) => [
        `Q${i + 1}`,
        `${q.score}%`,
        q.rubric_keyphrases_covered?.join(', ') || '-',
        q.rubric_keyphrases_missed?.join(', ') || '-'
      ]);

      const printableWidth = pageWidth - 28;
      const col23Width = (printableWidth - 35) / 2;
      
      autoTable(doc, {
        startY: yPos,
        head: [['Q#', 'Score', 'Covered Concepts', 'Missed Concepts']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
        columnStyles: {
          0: { cellWidth: 15, fontStyle: 'bold', halign: 'center' },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: col23Width },
          3: { cellWidth: col23Width }
        }
      });
      
      yPos = doc.lastAutoTable.finalY + 20;
    }

    // --- PAGE 2: Full Transcript ---
    if (feedback.history && feedback.history.length > 0) {
      doc.addPage();
      if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
      drawHeader('Full Transcript');
      
      yPos = 35;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(56, 178, 172); // Teal header matching sample
      doc.text('VI. FULL CHAT TRANSCRIPT', 14, yPos);
      yPos += 8;
      
      const marginX = 14;
      const boxWidth = pageWidth - (marginX * 2);
      const textPadding = 4;
      const textMaxWidth = boxWidth - (textPadding * 2) - 4; // -4 for the colored left border
      
      feedback.history.forEach((msg) => {
        if (msg.role === 'system') return; // Skip internal system prompts
        
        const isAI = msg.role === 'interviewer' || msg.role === 'ai';
        const roleText = isAI ? 'AI INTERVIEWER' : 'CANDIDATE';
        const textContent = msg.content || msg.text || '';
        
        // Colors based on user preference and sample
        // AI: Blue heading, blue border
        // Candidate: Green heading, green border
        const headColor = isAI ? [41, 128, 185] : [39, 174, 96]; 
        const bgColor = [250, 250, 250]; // Very light gray/white background
        const borderColor = isAI ? [41, 128, 185] : [39, 174, 96];

        // Reset character spacing & formatting before calculation
        if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        // splitTextToSize guarantees the text will wrap exactly at textMaxWidth
        const textLines = doc.splitTextToSize(textContent, textMaxWidth);
        const textDimensions = doc.getTextDimensions(textLines);
        
        // Header height (e.g. "AI INTERVIEWER")
        const headerHeight = 6;
        const boxHeight = textPadding + headerHeight + 2 + textDimensions.h + textPadding;
        
        // Add page break if this box won't fit
        if (yPos + boxHeight > pageHeight - 15) {
          doc.addPage();
          if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
          drawHeader('Full Transcript (Cont.)');
          yPos = 35;
        }

        // Draw Background Box
        doc.setFillColor(...bgColor);
        doc.rect(marginX, yPos, boxWidth, boxHeight, 'F');
        
        // Draw Left Border Indicator
        doc.setFillColor(...borderColor);
        doc.rect(marginX, yPos, 2.5, boxHeight, 'F');
        
        // Draw Role Header
        let currentY = yPos + textPadding + 4;
        if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...headColor);
        doc.text(roleText, marginX + 2.5 + textPadding, currentY);
        
        currentY += 6;
        
        // Draw Message Text with explicit zero char spacing
        if (typeof doc.setCharSpace === 'function') doc.setCharSpace(0);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(70, 70, 70); 
        doc.text(textLines, marginX + 2.5 + textPadding, currentY);
        
        yPos += boxHeight + 6; // Add margin bottom for the next message
      });
    }
    
    doc.save('Interview-Evaluation-Report.pdf');
  };

  const { overall_score: overallScore, strengths = [], weaknesses = [], detailed_summary: detailedSummary } = feedback;

  let statusClass = 'status-excellent';
  let statusText = 'Excellent';
  if (overallScore < 70) {
    statusClass = 'status-needs-work';
    statusText = 'Needs Improvement';
  } else if (overallScore < 85) {
    statusClass = 'status-good';
    statusText = 'Good';
  }

  const dashOffset = CIRCUMFERENCE - (animatedScore / 100) * CIRCUMFERENCE;

  return (
    <div className={`feedback-report card ${statusClass}`}>
      <div className="report-header">
        <div className="report-header-icon">📋</div>
        <h2>Candidate Evaluation Report</h2>
        <p className="report-desc">Review your technical interview performance below</p>
      </div>

      <div className={`score-section ${statusClass}`}>
        <div className="score-ring-wrap">
          <svg className="score-ring-svg" viewBox="0 0 110 110">
            <circle className="score-ring-bg" cx="55" cy="55" r="46" />
            <circle
              className="score-ring-fill"
              cx="55"
              cy="55"
              r="46"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="score-ring-label">
            <span className="score-number">{animatedScore}</span>
            <span className="score-max">/100</span>
          </div>
        </div>

        <div className="score-info">
          <div className="score-title">Overall Score</div>
          <div className="score-status-text">{statusText}</div>
          <div className="score-bar-wrap">
            <div className="score-bar-bg">
              <div className="score-bar-fill" style={{ width: `${animatedScore}%` }} />
            </div>
          </div>
        </div>
      </div>

      {detailedSummary && (
        <div className="summary-section">
          <h3>📝 Interview Summary</h3>
          <p>{detailedSummary}</p>
        </div>
      )}

      <div className="evaluation-grid">
        <div className="eval-card strengths">
          <div className="eval-card-header">
            <div className="eval-card-icon">✅</div>
            <h3>Key Strengths</h3>
          </div>
          {strengths.length > 0 ? (
            <ul className="eval-list">
              {strengths.map((s, i) => (
                <li key={i}>
                  <span className="eval-list-marker">✓</span>
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">No significant strengths recorded.</p>
          )}
        </div>
        
        <div className="eval-card weaknesses">
          <div className="eval-card-header">
            <div className="eval-card-icon">🎯</div>
            <h3>Areas for Improvement</h3>
          </div>
          {weaknesses.length > 0 ? (
            <ul className="eval-list">
              {weaknesses.map((w, i) => (
                <li key={i}>
                  <span className="eval-list-marker">→</span>
                  {w}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-text">No significant areas for improvement recorded.</p>
          )}
        </div>
      </div>

      <div className="report-actions" style={{ display: 'flex', gap: '15px', justifyContent: 'center', marginTop: '30px' }}>
        <button className="btn btn-secondary btn-lg" onClick={generatePDF}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Download Transcript (PDF)
        </button>
        <button className="btn btn-primary btn-lg" onClick={onRestart}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 .49-3.17"></path>
          </svg>
          Begin New Interview
        </button>
      </div>
    </div>
  );
}
