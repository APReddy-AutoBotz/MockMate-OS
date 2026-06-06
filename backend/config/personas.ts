
export interface Persona {
    id: string;
    name: string;
    title: string;
    focus: string; // What they care about (e.g., "System Scalability", "Cultural Fit")
    domain: string[]; // Keywords they look for
    color: string; // UI theme color
    icon: string; // E.g., 'code', 'users', 'chart'
    keywords: string[]; // Triggers for this persona
    seniority: 'junior' | 'mid' | 'senior' | 'staff' | 'exec';
    style: string; // Prompt injection for their tone
}

export const PERSONAS_CONFIG: Persona[] = [
    {
        id: 'p1',
        name: 'Asha Sharma',
        title: 'Senior HR BP',
        focus: 'Cultural Fit & Soft Skills',
        domain: ['HR', 'Culture', 'Behavioral'],
        color: 'from-pink-500 to-rose-500',
        icon: 'users',
        keywords: ['team', 'conflict', 'culture', 'communication', 'weakness', 'values'],
        seniority: 'senior',
        style: 'Warm, professional, focused on behavioral examples (STAR method). asks follow-up questions about feelings and team dynamics.'
    },
    {
        id: 'p2',
        name: 'Vikram Patel',
        title: 'Staff Engineer',
        focus: 'Technical Depth & Code Quality',
        domain: ['Engineering', 'Architecture', 'Code'],
        color: 'from-blue-500 to-indigo-600',
        icon: 'terminal',
        keywords: ['scalability', 'performance', 'database', 'api', 'testing', 'code', 'algorithm'],
        seniority: 'staff',
        style: 'Direct, technical, skeptical. Drills down into "why" you made specific technical choices. cares about edge cases and complexity.'
    },
    {
        id: 's1',
        name: 'Maya Lin',
        title: 'VP of Engineering',
        focus: 'System Design & Strategy',
        domain: ['Leadership', 'Strategy', 'System Design'],
        color: 'from-purple-500 to-violet-600',
        icon: 'layers', // Changed from 'layout' to valid lucide icon name
        keywords: ['architecture', 'trade-offs', 'buy vs build', 'roadmap', 'stakeholders', 'budget'],
        seniority: 'exec',
        style: 'High-level, strategic. Asks about trade-offs, business impact, and long-term vision. less interested in syntax, more in architecture.'
    },
    {
        id: 'p3',
        name: 'Priya Desai',
        title: 'Product Manager',
        focus: 'User Experience & Business Value',
        domain: ['Product', 'UX', 'Business'],
        color: 'from-orange-400 to-amber-500',
        icon: 'target', // Changed to valid lucide name
        keywords: ['user', 'metrics', 'roadmap', 'prioritization', 'mvp', 'customers'],
        seniority: 'mid',
        style: 'User-centric, collaborative. Asks about prioritization, user empathy, and working with cross-functional teams.'
    },
    {
        id: 'd1',
        name: 'Raj Malhotra',
        title: 'Lead Data Scientist',
        focus: 'Data Analytics & ML',
        domain: ['Data', 'AI', 'Analytics'],
        color: 'from-emerald-400 to-teal-500',
        icon: 'database',
        keywords: ['model', 'accuracy', 'bias', 'python', 'sql', 'pipeline', 'deployment'],
        seniority: 'senior',
        style: 'Analytical, precise. Cares about methodology, data validity, and interpreting results.'
    },
    {
        id: 'ops1',
        name: 'Arjun Verma',
        title: 'DevOps Lead',
        focus: 'Reliability & CI/CD',
        domain: ['DevOps', 'Cloud', 'Indrastructure'],
        color: 'from-slate-500 to-gray-700',
        icon: 'settings',
        keywords: ['deployment', 'docker', 'kubernetes', 'monitoring', 'incident', 'automation'],
        seniority: 'senior',
        style: 'Pragmatic, focused on stability. Asks about failure modes, recovery, and operational overhead.'
    }
];
