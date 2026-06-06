import React from 'react';
import { TalentAcquisitionIcon, BriefcaseIcon, DevLeadIcon, DataScientistIcon, DomainExpertIcon, ProjectManagerIcon, ExecutiveSponsorIcon, ClinicalSupervisorIcon, MarketingLeadIcon } from './components/icons/personaIcons';

export type PersonaDomain = 'General' | 'Tech' | 'Business' | 'Healthcare' | 'Creative';

export type Persona = {
  id: string;
  name: string;
  title: string;
  focus: string;
  domain: PersonaDomain[];
  color: string;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  blurb: string;
  // Enhanced Metadata for Intelligent Matching
  keywords: string[];
  seniority: 'Entry' | 'Mid' | 'Senior' | 'Executive' | 'All';
  style: string;
  matchRules?: string; // Optional natural language rule for the AI matcher
};

// This is the single source of truth for persona details.
export const PERSONAS_CONFIG: Persona[] = [
  // General & HR
  { 
    id: 'p1', 
    name: "Asha", 
    title: "Talent Acq. Manager",
    focus: "Culture, Communication, STAR Method",
    domain: ['General'],
    color: 'alert-coral', 
    icon: TalentAcquisitionIcon, 
    blurb: 'Assesses culture fit and communication.',
    keywords: ['behavioral', 'culture fit', 'soft skills', 'communication', 'STAR method', 'recruiter', 'hr'],
    seniority: 'All',
    style: 'Friendly, encouraging, but persistent on details.'
  },
  {
    id: 's1',
    name: 'Eleanor',
    title: 'HR Director',
    focus: 'Compensation, Team Dynamics, Retention',
    domain: ['General', 'Business'],
    color: 'alert-coral',
    icon: BriefcaseIcon,
    blurb: 'Focuses on senior-level HR topics and organizational strategy.',
    keywords: ['management', 'leadership', 'conflict resolution', 'strategy', 'organizational design', 'policy'],
    seniority: 'Senior',
    style: 'Professional, policy-focused, situational.'
  },
  // Technical
  { 
    id: 'p2', 
    name: "Vikram", 
    title: "Dev Lead",
    focus: "Code, Systems Design, Tool Rigor",
    domain: ['Tech'], 
    color: 'action-teal', 
    icon: DevLeadIcon, 
    blurb: 'Validates technical execution and tool knowledge.',
    keywords: ['coding', 'system design', 'architecture', 'algorithms', 'react', 'node', 'python', 'aws', 'cloud', 'devops'],
    seniority: 'Mid',
    style: 'Technical, rigorous, prefers efficient code.'
  },
   {
    id: 's2',
    name: 'Kenji',
    title: 'Data Scientist',
    focus: 'Modeling, Statistics, Bias Detection',
    domain: ['Tech'],
    color: 'info-blue',
    icon: DataScientistIcon,
    blurb: 'Analyzes statistical rigor and modeling choices.',
    keywords: ['data', 'machine learning', 'ai', 'statistics', 'python', 'pandas', 'sql', 'analytics', 'modeling'],
    seniority: 'All',
    style: 'Analytical, precise, data-driven.'
  },
  // Business & Project Management
  { 
    id: 'p3', 
    name: "Maya", 
    title: "Project/Ops Manager",
    focus: "Risk, Timeline, Stakeholder Mgmt",
    domain: ['Business', 'Tech'], 
    color: 'accent-amber', 
    icon: ProjectManagerIcon, 
    blurb: 'Evaluates project ownership and business ROI.',
    keywords: ['agile', 'scrum', 'project management', 'timeline', 'delivery', 'risk', 'stakeholders', 'jira'],
    seniority: 'Mid',
    style: 'Organized, focused on process and outcomes.'
  },
  {
    id: 's4',
    name: 'Marcus',
    title: 'Executive Sponsor',
    focus: 'Strategic Alignment, Vision, Budget',
    domain: ['Business'],
    color: 'info-blue',
    icon: ExecutiveSponsorIcon,
    blurb: 'Connects responses to high-level business vision. Typically for senior/lead roles.',
    keywords: ['strategy', 'vision', 'budget', 'roi', 'executive', 'leadership', 'growth', 'business case'],
    seniority: 'Executive',
    style: 'Big-picture, results-oriented, slightly impatient with details.'
  },
   {
    id: 's6',
    name: 'Chloe',
    title: 'Marketing Lead',
    focus: 'Go-to-Market, Brand, User Acquisition',
    domain: ['Business', 'Creative'],
    color: 'alert-coral',
    icon: MarketingLeadIcon,
    blurb: 'Evaluates market awareness and growth mindset.',
    keywords: ['marketing', 'brand', 'growth', 'social media', 'content', 'campaign', 'user acquisition'],
    seniority: 'All',
    style: 'Creative, energetic, customer-centric.'
  },
  // Specialist & Domain Experts
  {
    id: 's3',
    name: 'Isabelle',
    title: 'Domain Expert',
    focus: 'Compliance, Regulation, Subject Matter Depth',
    domain: ['General'], // Applicable to many fields like law, finance
    color: 'accent-amber',
    icon: DomainExpertIcon,
    blurb: 'Ensures deep subject matter expertise.',
    keywords: ['law', 'finance', 'compliance', 'regulation', 'audit', 'tax', 'legal'],
    seniority: 'Senior',
    style: 'Detail-oriented, formal, accuracy-focused.'
  },
  {
    id: 's5',
    name: 'Dr. Ben Carter',
    title: 'Clinical Supervisor',
    focus: 'Patient Care, Medical Ethics, Clinical Protocols',
    domain: ['Healthcare'],
    color: 'info-blue',
    icon: ClinicalSupervisorIcon,
    blurb: 'Assesses clinical knowledge and patient empathy.',
    keywords: ['healthcare', 'medical', 'clinical', 'patient', 'nursing', 'doctor', 'ethics', 'hospital'],
    seniority: 'All',
    style: 'Empathetic, ethical, patient-safety focused.'
  }
];