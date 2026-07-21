
import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { FinalReport, AdvisorAssessment, QuestionPerformance } from 'mockmate-shared';

// Exact Brand Colors
const colors = {
    baseSurface: rgb(10 / 255, 25 / 255, 47 / 255),
    actionTeal: rgb(20 / 255, 200 / 255, 176 / 255),
    infoBlue: rgb(56 / 255, 189 / 255, 248 / 255),
    textPrimary: rgb(230 / 255, 241 / 255, 248 / 255),
    textSecondary: rgb(168 / 255, 178 / 255, 209 / 255),
    accentAmber: rgb(251 / 255, 191 / 255, 36 / 255),
    alertCoral: rgb(248 / 255, 106 / 255, 106 / 255),
    brandOrange: rgb(249 / 255, 115 / 255, 22 / 255),
    white: rgb(1, 1, 1),
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;

class PDFBuilder {
    pdfDoc: PDFDocument;
    page: any;
    y: number;
    helvetica: PDFFont;
    helveticaBold: PDFFont;

    constructor(pdfDoc: PDFDocument, fonts: { helvetica: PDFFont, helveticaBold: PDFFont }) {
        this.pdfDoc = pdfDoc;
        this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        this.y = PAGE_HEIGHT - MARGIN;
        this.helvetica = fonts.helvetica;
        this.helveticaBold = fonts.helveticaBold;
        this.drawBackground();
    }

    drawBackground() {
        this.page.drawRectangle({
            x: 0,
            y: 0,
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT,
            color: colors.baseSurface,
        });
    }

    drawLogo(x: number, y: number, scale: number = 0.4) {
        const navy = rgb(2 / 255, 6 / 255, 23 / 255);
        const size = 100 * scale;
        this.page.drawRectangle({
            x: x, y: y, width: size, height: size,
            color: navy, borderWidth: 1, borderColor: colors.infoBlue,
        });
        this.page.drawLine({
            start: { x: x + 25 * scale, y: y + 30 * scale },
            end: { x: x + 25 * scale, y: y + 70 * scale },
            color: colors.textSecondary, thickness: 6 * scale,
        });
        this.page.drawLine({
            start: { x: x + 25 * scale, y: y + 70 * scale },
            end: { x: x + 50 * scale, y: y + 45 * scale },
            color: colors.textSecondary, thickness: 6 * scale,
        });
        this.page.drawLine({
            start: { x: x + 50 * scale, y: y + 45 * scale },
            end: { x: x + 75 * scale, y: y + 70 * scale },
            color: colors.textSecondary, thickness: 6 * scale,
        });
        this.page.drawLine({
            start: { x: x + 75 * scale, y: y + 70 * scale },
            end: { x: x + 75 * scale, y: y + 30 * scale },
            color: colors.textSecondary, thickness: 6 * scale,
        });
        this.page.drawRectangle({
            x: x + 46 * scale, y: y + 55 * scale,
            width: 8 * scale, height: 12 * scale, color: colors.brandOrange,
        });
        this.page.drawText('Mock', { x: x + size + 15, y: y + 18, font: this.helveticaBold, size: 28, color: colors.textPrimary });
        this.page.drawText('Mate', { x: x + size + 105, y: y + 18, font: this.helveticaBold, size: 28, color: colors.actionTeal });
    }

    async checkNewPage(neededHeight: number) {
        if (this.y - neededHeight < MARGIN) {
            this.page = this.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            this.y = PAGE_HEIGHT - MARGIN;
            this.drawBackground();
            this.drawSmallHeader();
        }
    }

    drawSmallHeader() {
        this.page.drawText('CONFIDENTIAL • MockMate AI Assessment', {
            x: MARGIN, y: PAGE_HEIGHT - 30, font: this.helvetica, size: 8, color: colors.textSecondary, opacity: 0.4
        });
    }

    drawText(text: string, x: number, y: number, font: PDFFont, size: number, color: any, maxWidth?: number) {
        let lines: string[] = [text];
        if (maxWidth) lines = this.wrapText(text, maxWidth, font, size);
        let currentY = y;
        for (const line of lines) {
            this.page.drawText(line, { x, y: currentY, font, size, color });
            currentY -= (size * 1.4);
        }
        return currentY;
    }

    wrapText(text: string, maxWidth: number, font: PDFFont, size: number): string[] {
        if (!text) return [];
        const words = text.replace(/\n/g, ' \n ').split(' ');
        const lines: string[] = [];
        let currentLine = '';
        for (const word of words) {
            if (word === '\n') { lines.push(currentLine); currentLine = ''; continue; }
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            if (font.widthOfTextAtSize(testLine, size) > maxWidth) {
                lines.push(currentLine); currentLine = word;
            } else { currentLine = testLine; }
        }
        lines.push(currentLine);
        return lines.filter(l => l && l.trim() !== '');
    }

    async drawTitlePage(report: FinalReport) {
        this.y -= 100;
        this.drawLogo(MARGIN, this.y, 0.6);
        this.y -= 120;
        this.drawText('SESSION INTELLIGENCE REPORT', MARGIN, this.y, this.helveticaBold, 10, colors.infoBlue);
        this.y -= 30;
        const mainTitle = report.biggestRiskArea?.title || report.readiness?.status?.replace(/_/g, ' ') || "Assessment";
        this.drawText(mainTitle, MARGIN, this.y, this.helveticaBold, 22, colors.textPrimary, PAGE_WIDTH - 100);
        this.y -= 45;
        this.drawText(`Status: ${report.readiness?.status || 'N/A'}`, MARGIN, this.y, this.helveticaBold, 12, colors.actionTeal);
        this.y -= 80;
        this.drawText('EXECUTIVE SUMMARY', MARGIN, this.y, this.helveticaBold, 9, colors.infoBlue);
        this.y -= 25;
        this.y = this.drawText(report.overallSummary || '', MARGIN, this.y, this.helvetica, 10, colors.textPrimary, PAGE_WIDTH - MARGIN * 2);
    }

    async drawQuantitativeSection(report: FinalReport) {
        if (!report.quantitativeAnalysis?.competency_scores) return;
        this.y -= 40;
        await this.checkNewPage(100);
        this.drawText('COMPETENCY RADAR (QUANTITATIVE)', MARGIN, this.y, this.helveticaBold, 10, colors.infoBlue);
        this.y -= 25;

        for (const item of report.quantitativeAnalysis.competency_scores) {
            const scoreColor = item.score > 80 ? colors.actionTeal : item.score > 60 ? colors.accentAmber : colors.alertCoral;
            this.drawText(`${item.score}%`, MARGIN, this.y, this.helveticaBold, 10, scoreColor);
            this.drawText(item.competency, MARGIN + 40, this.y, this.helveticaBold, 10, colors.textPrimary);
            this.y -= 12;
            this.y = this.drawText(item.reason, MARGIN + 40, this.y, this.helvetica, 9, colors.textSecondary, PAGE_WIDTH - MARGIN * 2 - 40);
            this.y -= 15;
            await this.checkNewPage(50);
        }
    }

    async drawRiskSection(report: FinalReport) {
        if (!report.biggestRiskArea) return;
        this.y -= 40;
        await this.checkNewPage(120);

        // Draw Red Box Logic (simulated with bg color if lib supported, but here just text)
        this.drawText('PRIORITY RISK DETECTED', MARGIN, this.y, this.helveticaBold, 10, colors.alertCoral);
        this.y -= 20;
        this.drawText(report.biggestRiskArea.title, MARGIN, this.y, this.helveticaBold, 14, colors.white);
        this.y -= 25;

        this.drawText('OBSERVATION:', MARGIN, this.y, this.helveticaBold, 8, colors.alertCoral);
        this.y -= 12;
        this.y = this.drawText(report.biggestRiskArea.observation || '', MARGIN, this.y, this.helvetica, 9, colors.textSecondary, PAGE_WIDTH - MARGIN * 2);

        this.y -= 15;
        this.drawText('MITIGATION:', MARGIN, this.y, this.helveticaBold, 8, colors.actionTeal);
        this.y -= 12;
        this.y = this.drawText(report.biggestRiskArea.mitigation || '', MARGIN, this.y, this.helvetica, 9, colors.textSecondary, PAGE_WIDTH - MARGIN * 2);
    }

    async drawQuestionPerformance(performance: QuestionPerformance[]) {
        if (!performance || performance.length === 0) return;
        this.y -= 40;
        await this.checkNewPage(150);
        this.drawText('PERFORMANCE AUDIT (TURN-BY-TURN)', MARGIN, this.y, this.helveticaBold, 10, colors.infoBlue);
        this.y -= 30;
        for (const q of performance) {
            const isSkipped = q.user_transcript === '[SKIPPED]';
            await this.checkNewPage(250); // Ensure enough space for a full question block or break early

            // Question Header
            this.drawText(`QUESTION:`, MARGIN, this.y, this.helveticaBold, 8, isSkipped ? colors.alertCoral : colors.textSecondary);
            this.y -= 12;
            this.y = this.drawText(q.question_text, MARGIN, this.y, this.helvetica, 11, colors.white, PAGE_WIDTH - MARGIN * 2);
            this.y -= 15;

            // Ideal Answer (Requested Feature)
            this.drawText('IDEAL MASTERY RESPONSE:', MARGIN, this.y, this.helveticaBold, 8, colors.actionTeal);
            this.y -= 12;
            this.y = this.drawText(q.max_impact_response, MARGIN, this.y, this.helvetica, 9, colors.textSecondary, PAGE_WIDTH - MARGIN * 2);
            this.y -= 15;

            // Strengths
            if (q.strengths && q.strengths.length > 0) {
                this.drawText('STRENGTHS (+):', MARGIN, this.y, this.helveticaBold, 8, colors.actionTeal);
                this.y -= 10;
                for (const s of q.strengths) {
                    this.y = this.drawText(`• ${s}`, MARGIN + 10, this.y, this.helvetica, 9, colors.textSecondary, PAGE_WIDTH - MARGIN * 2 - 10);
                }
                this.y -= 10;
            }

            // Improvements
            if (q.improvements && q.improvements.length > 0) {
                this.drawText('GAPS (!):', MARGIN, this.y, this.helveticaBold, 8, colors.alertCoral);
                this.y -= 10;
                for (const s of q.improvements) {
                    this.y = this.drawText(`• ${s}`, MARGIN + 10, this.y, this.helvetica, 9, colors.textSecondary, PAGE_WIDTH - MARGIN * 2 - 10);
                }
                this.y -= 10;
            }

            this.y -= 30;
        }
    }
}

export const generatePdf = async (report: FinalReport) => {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const builder = new PDFBuilder(pdfDoc, { helvetica, helveticaBold });
    await builder.drawTitlePage(report);
    await builder.drawQuantitativeSection(report);
    await builder.drawRiskSection(report);
    await builder.drawQuestionPerformance(report.questionPerformance);
    const pdfBytes = await pdfDoc.save();
    const pdfUint8 = new Uint8Array(pdfBytes);
    const blob = new Blob([pdfUint8], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `MockMate_Audit_${Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
