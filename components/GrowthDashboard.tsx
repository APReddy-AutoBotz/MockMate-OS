import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getSessionHistory } from '../services/storageService';
import { FinalReport } from 'mockmate-shared';
import { useIsMobile } from '../hooks/useIsMobile';

interface GrowthDashboardProps {
    onBack: () => void;
    onViewReport: (report: FinalReport) => void;
}

const ReadinessMap: Record<string, number> = {
    NOT_READY: 1,
    ALMOST_READY: 2,
    INTERVIEW_READY: 3
};

const readinessCopy = (status: string) => status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const GrowthDashboard: React.FC<GrowthDashboardProps> = React.memo(({ onBack, onViewReport }) => {
    const isMobile = useIsMobile();
    const history = useMemo(() => getSessionHistory().reverse(), []);

    const chartData = useMemo(() => history.map(h => ({
        date: new Date(h.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        confidence: h.avgScore,
        readiness: ReadinessMap[h.readinessStatus] || 1,
        role: h.role
    })), [history]);

    const latestSessions = useMemo(() => [...history].reverse(), [history]);

    const handleBack = useCallback(() => {
        onBack();
    }, [onBack]);

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8 p-1 sm:p-4 md:space-y-12 md:p-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-8 md:pb-10 gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                        <span className="text-[9px] md:text-[10px] font-bold text-brand-primary uppercase tracking-[0.14em] block">Growth journal</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-semibold text-white tracking-tight leading-none">Your practice progress</h1>
                </div>
                <button
                    onClick={handleBack}
                    className="w-full md:w-auto flex items-center justify-center gap-3 px-6 py-4 md:py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold text-brand-tint hover:text-white hover:bg-white/10 uppercase tracking-[0.12em] transition-all"
                >
                    Back home
                </button>
            </header>

            {history.length === 0 ? (
                <div className="text-center py-20 md:py-32 bg-white/[0.02] border border-dashed border-white/10 rounded-[24px] px-6">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                        <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-white mb-3 md:mb-4">No sessions yet</h2>
                    <p className="text-xs md:text-sm text-brand-tint">Complete your first interview practice to see your progress here.</p>
                </div>
            ) : (
                <>
                    <div className="mb-8 grid grid-cols-1 gap-4 md:mb-12 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                        {latestSessions.map((session, idx) => (
                            <motion.div
                                key={session.id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ duration: 0.4, delay: idx * 0.05 }}
                                className="bg-white/[0.03] border border-white/10 rounded-[24px] p-5 md:p-6 hover:bg-white/[0.05] transition-all group"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <div
                                                className={`w-2 h-2 rounded-full ${
                                                    session.readinessStatus === 'INTERVIEW_READY' ? 'bg-brand-primary' :
                                                        session.readinessStatus === 'ALMOST_READY' ? 'bg-amber-400' :
                                                            'bg-red-300'
                                                    }`}
                                            />
                                            <span className="text-xs font-bold text-white tracking-tight">{readinessCopy(session.readinessStatus)}</span>
                                        </div>
                                        <span className="text-[9px] font-bold uppercase text-brand-tint tracking-[0.1em] pl-4">Readiness</span>
                                    </div>
                                    <div className="text-2xl font-bold text-brand-primary leading-none">{session.avgScore} <span className="text-[10px] text-brand-tint">/100</span></div>
                                </div>

                                <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/5">
                                    <span className="text-[10px] text-brand-tint">{new Date(session.timestamp).toLocaleDateString()}</span>
                                    <button
                                        onClick={() => session.fullReport && onViewReport(session.fullReport)}
                                        disabled={!session.fullReport}
                                        className="text-[9px] font-bold uppercase tracking-[0.12em] text-brand-primary hover:text-white transition-colors disabled:opacity-40 flex items-center gap-2"
                                    >
                                        View report
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    <div className="mt-10 md:mt-12 bg-white/[0.02] border border-white/5 rounded-[24px] p-4 md:p-8">
                        <div className={`mb-6 flex flex-col items-center text-center ${isMobile ? 'space-y-1' : 'space-y-2'}`}>
                            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-[0.14em]">Progress over time</span>
                            <h3 className="text-xl md:text-2xl font-semibold text-white tracking-tight">Interview readiness</h3>
                        </div>
                        <div className="min-h-[220px] w-full min-w-0 md:min-h-[300px]">
                            <ResponsiveContainer width="100%" height={isMobile ? 220 : 300} minWidth={0} minHeight={220}>
                                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 9, fill: '#A8C5DA', fontWeight: 700 }}
                                        stroke="rgba(255,255,255,0.08)"
                                        axisLine={false}
                                    />
                                    <YAxis
                                        dataKey="readiness"
                                        domain={[0, 4]}
                                        tick={{ fill: '#A8C5DA', fontSize: 9 }}
                                        stroke="rgba(255,255,255,0.08)"
                                        axisLine={false}
                                        ticks={[1, 2, 3]}
                                        tickFormatter={(val) => val === 1 ? 'Low' : val === 2 ? 'Mid' : 'Ready'}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#001A2D', border: '1px solid rgba(168,197,218,0.2)', borderRadius: '12px', padding: '12px' }}
                                        itemStyle={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}
                                        labelStyle={{ color: '#A8C5DA', fontSize: '9px', marginBottom: '4px', fontWeight: 700 }}
                                        cursor={{ stroke: 'rgba(255,188,3,0.25)', strokeWidth: 1 }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="readiness"
                                        stroke="#FFBC03"
                                        strokeWidth={3}
                                        fill="url(#readinessGradient)"
                                        fillOpacity={1}
                                        animationDuration={1500}
                                    />
                                    <defs>
                                        <linearGradient id="readinessGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#FFBC03" stopOpacity={0.18} />
                                            <stop offset="100%" stopColor="#FFBC03" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});

export default GrowthDashboard;
