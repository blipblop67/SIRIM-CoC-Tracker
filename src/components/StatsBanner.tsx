import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  Layers,
  BarChart2,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts';
import { SirimApplication, SheetSyncConfig } from '../types';
import { isActionRequired, isPendingStatement } from '../utils/actionItemUtils';

interface StatsBannerProps {
  applications: SirimApplication[];
  sheetConfig: SheetSyncConfig | null;
  onFilterStatus: (status: string) => void;
  onOpenSheetModal: () => void;
}

// Minimalist, high-contrast SaaS status color mapping
const STATUS_COLORS: Record<string, string> = {
  RFI_ACTION_REQUIRED: '#e11d48', // rose-600
  SAMPLE_REQUESTED: '#d97706', // amber-600
  PAYMENT_PENDING: '#f59e0b', // amber-500
  SUBMITTED: '#64748b', // slate-500
  UNDER_REVIEW: '#3b82f6', // blue-500
  SAMPLE_SUBMITTED: '#0284c7', // sky-600
  TESTING_IN_PROGRESS: '#6366f1', // indigo-500
  FINAL_EVALUATION: '#8b5cf6', // violet-500
  APPROVED: '#10b981', // emerald-500
  REJECTED: '#ef4444', // red-500
  EXPIRED: '#94a3b8', // slate-400
};

export const StatsBanner: React.FC<StatsBannerProps> = ({
  applications,
  onFilterStatus,
}) => {
  const [isChartExpanded, setIsChartExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'distribution' | 'timeline' | 'scheme'>('distribution');
  const [timeWindowDays, setTimeWindowDays] = useState<number>(30);

  // 1. Core KPIs
  const total = applications.length;

  const actionRequiredList = useMemo(
    () =>
      applications.filter(
        (app) =>
          ['SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(app.status) ||
          (app.status === 'RFI_ACTION_REQUIRED' && app.supplierStatus !== 'WAITING_FOR_SUPPLIER_DOCS') ||
          app.actionItems.some((a) => !a.isCompleted && isActionRequired(a))
      ),
    [applications]
  );

  const inReviewList = useMemo(
    () =>
      applications.filter((app) =>
        [
          'SUBMITTED',
          'UNDER_REVIEW',
          'SAMPLE_SUBMITTED',
          'TESTING_IN_PROGRESS',
          'FINAL_EVALUATION',
        ].includes(app.status) ||
        (app.status === 'RFI_ACTION_REQUIRED' && app.supplierStatus === 'WAITING_FOR_SUPPLIER_DOCS')
      ),
    [applications]
  );

  const pendingStatementsCount = useMemo(
    () =>
      applications
        .flatMap((a) => a.actionItems)
        .filter((act) => !act.isCompleted && isPendingStatement(act)).length,
    [applications]
  );

  const approvedList = useMemo(
    () => applications.filter((app) => app.status === 'APPROVED'),
    [applications]
  );

  const criticalItems = useMemo(
    () =>
      applications
        .flatMap((a) => a.actionItems)
        .filter((act) => !act.isCompleted && act.priority === 'CRITICAL' && isActionRequired(act)),
    [applications]
  );

  // Auto-resolved items count for productivity metric
  const autoResolvedCount = useMemo(
    () =>
      applications
        .flatMap((a) => a.actionItems)
        .filter((act) => act.isCompleted && act.autoResolvedByAi).length,
    [applications]
  );

  // 2. Filter applications within the selected window
  const windowFilteredApps = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - timeWindowDays);

    return applications.filter((app) => {
      const appDate = app.lastActivityDate
        ? new Date(app.lastActivityDate)
        : app.submissionDate
        ? new Date(app.submissionDate)
        : null;

      if (!appDate || isNaN(appDate.getTime())) return true;
      return appDate >= cutoffDate;
    });
  }, [applications, timeWindowDays]);

  // 3. Status Distribution Data
  const statusDistributionData = useMemo(() => {
    const appsToUse = windowFilteredApps.length > 0 ? windowFilteredApps : applications;
    const countMap: Record<string, { count: number; apps: SirimApplication[]; label: string }> = {
      RFI_ACTION_REQUIRED: { count: 0, apps: [], label: 'Action Required (RFI)' },
      SAMPLE_REQUESTED: { count: 0, apps: [], label: 'Sample Requested' },
      PAYMENT_PENDING: { count: 0, apps: [], label: 'Payment Pending' },
      UNDER_REVIEW: { count: 0, apps: [], label: 'Under Review' },
      TESTING_IN_PROGRESS: { count: 0, apps: [], label: 'Testing / Lab Evaluation' },
      FINAL_EVALUATION: { count: 0, apps: [], label: 'Final Evaluation' },
      APPROVED: { count: 0, apps: [], label: 'Approved & Certified' },
      SUBMITTED: { count: 0, apps: [], label: 'Submitted' },
    };

    appsToUse.forEach((app) => {
      if (countMap[app.status]) {
        countMap[app.status].count += 1;
        countMap[app.status].apps.push(app);
      } else {
        const key = app.status;
        countMap[key] = {
          count: 1,
          apps: [app],
          label: key.replace(/_/g, ' '),
        };
      }
    });

    return Object.entries(countMap)
      .filter(([_, data]) => data.count > 0)
      .map(([statusKey, data]) => ({
        status: statusKey,
        name: data.label,
        value: data.count,
        percentage: ((data.count / (appsToUse.length || 1)) * 100).toFixed(0),
        color: STATUS_COLORS[statusKey] || '#64748b',
        applications: data.apps,
      }))
      .sort((a, b) => b.value - a.value);
  }, [windowFilteredApps, applications]);

  // 4. Activity Timeline Trend Data
  const timelineTrendData = useMemo(() => {
    const now = new Date();
    const intervals: { label: string; startDate: Date; endDate: Date }[] = [];
    const stepDays = Math.max(2, Math.floor(timeWindowDays / 6));

    for (let i = 5; i >= 0; i--) {
      const end = new Date(now);
      end.setDate(now.getDate() - i * stepDays);
      const start = new Date(end);
      start.setDate(end.getDate() - (stepDays - 1));

      const label = `${start.getDate()} ${start.toLocaleString('default', { month: 'short' })}`;
      intervals.push({ label, startDate: start, endDate: end });
    }

    return intervals.map((interval) => {
      const activeInInterval = applications.filter((app) => {
        const dStr = app.lastActivityDate || app.submissionDate;
        if (!dStr) return false;
        const d = new Date(dStr);
        return d >= interval.startDate && d <= interval.endDate;
      });

      const actionReqCount = activeInInterval.filter((a) =>
        ['RFI_ACTION_REQUIRED', 'SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(a.status)
      ).length;

      const inReviewCount = activeInInterval.filter((a) =>
        ['SUBMITTED', 'UNDER_REVIEW', 'SAMPLE_SUBMITTED', 'TESTING_IN_PROGRESS', 'FINAL_EVALUATION'].includes(
          a.status
        )
      ).length;

      const approvedCount = activeInInterval.filter((a) => a.status === 'APPROVED').length;

      return {
        dateRange: interval.label,
        'Action Required': actionReqCount,
        'In Review': inReviewCount,
        'Approved': approvedCount,
        totalActivity: activeInInterval.length,
      };
    });
  }, [applications, timeWindowDays]);

  // 5. Scheme Distribution Data
  const schemeData = useMemo(() => {
    const appsToUse = windowFilteredApps.length > 0 ? windowFilteredApps : applications;
    const schemes: Record<string, { total: number; approved: number; actionReq: number; inReview: number }> = {};

    appsToUse.forEach((app) => {
      const s = app.scheme || 'Type Approval';
      if (!schemes[s]) {
        schemes[s] = { total: 0, approved: 0, actionReq: 0, inReview: 0 };
      }
      schemes[s].total += 1;
      if (app.status === 'APPROVED') {
        schemes[s].approved += 1;
      } else if (['RFI_ACTION_REQUIRED', 'SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(app.status)) {
        schemes[s].actionReq += 1;
      } else {
        schemes[s].inReview += 1;
      }
    });

    return Object.entries(schemes).map(([schemeName, counts]) => ({
      name: schemeName.replace(' (MCMC/SIRIM)', '').replace(' (MS Standards)', ''),
      'Approved': counts.approved,
      'In Review': counts.inReview,
      'Action Required': counts.actionReq,
      total: counts.total,
    }));
  }, [windowFilteredApps, applications]);

  // Tooltip
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-lg border border-slate-800 text-xs font-sans max-w-xs z-50">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: data.color }} />
            <span className="font-semibold text-slate-100">{data.name}</span>
          </div>
          <div className="text-slate-300 font-mono text-[11px] tabular-nums">
            {data.value} applications ({data.percentage}%)
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <section className="mb-6 space-y-3">
      {/* High-Density Minimalist KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Active Registry */}
        <div
          onClick={() => onFilterStatus('ALL')}
          className="bg-white border border-slate-200/80 rounded-xl p-4 hover:border-slate-300 transition-all cursor-pointer group shadow-2xs"
          title="View all applications"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-900 transition-colors">
              Total Applications
            </span>
            <Layers className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 tracking-tight">
              {total}
            </span>
            <span className="text-xs text-slate-400">files</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Active monitoring</span>
            {autoResolvedCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-indigo-600 font-medium font-mono tabular-nums">
                  {autoResolvedCount} AI-verified
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Action Required */}
        <div
          onClick={() => onFilterStatus('ACTION_REQUIRED')}
          className={`bg-white border rounded-xl p-4 transition-all cursor-pointer group shadow-2xs ${
            criticalItems.length > 0
              ? 'border-rose-300/80 hover:border-rose-400'
              : 'border-slate-200/80 hover:border-slate-300'
          }`}
          title="Filter by Action Required"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-rose-600 transition-colors">
              Action Required
            </span>
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                criticalItems.length > 0 ? 'text-rose-500' : 'text-slate-400 group-hover:text-rose-500'
              } transition-colors`}
            />
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${
                actionRequiredList.length > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {actionRequiredList.length}
            </span>
            <span className="text-xs text-slate-400">pending</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            {criticalItems.length > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                <span className="text-rose-600 font-semibold font-mono tabular-nums">
                  {criticalItems.length} urgent bottleneck{criticalItems.length === 1 ? '' : 's'}
                </span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span>Awaiting applicant response</span>
              </>
            )}
          </div>
        </div>

        {/* Card 3: In Review & Lab Testing */}
        <div
          onClick={() => onFilterStatus('IN_PROGRESS')}
          className="bg-white border border-slate-200/80 rounded-xl p-4 hover:border-slate-300 transition-all cursor-pointer group shadow-2xs"
          title="Filter by In Progress / Evaluation"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-indigo-600 transition-colors">
              In Review & Testing
            </span>
            <Clock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 tracking-tight">
              {inReviewList.length}
            </span>
            <span className="text-xs text-slate-400">underway</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
            <span>SIRIM / Lab evaluation</span>
            {pendingStatementsCount > 0 && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-slate-600 font-mono tabular-nums">
                  {pendingStatementsCount} waiting
                </span>
              </>
            )}
          </div>
        </div>

        {/* Card 4: CoC Approved */}
        <div
          onClick={() => onFilterStatus('APPROVED')}
          className="bg-white border border-slate-200/80 rounded-xl p-4 hover:border-slate-300 transition-all cursor-pointer group shadow-2xs"
          title="Filter by Approved Certificates"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-emerald-700 transition-colors">
              CoC Granted
            </span>
            <FileCheck className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 tracking-tight">
              {approvedList.length}
            </span>
            <span className="text-xs text-slate-400">certified</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>Label purchasing active</span>
          </div>
        </div>
      </div>

      {/* Analytics Drawer Toggle Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-slate-400">
          Click any metric above to filter register records
        </span>
        <button
          onClick={() => setIsChartExpanded(!isChartExpanded)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors py-1 px-2 rounded-md hover:bg-slate-100"
        >
          <BarChart2 className="w-3.5 h-3.5 text-slate-500" />
          <span>{isChartExpanded ? 'Hide Analytics' : 'Analytics & Trend'}</span>
          {isChartExpanded ? (
            <ChevronUp className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
        </button>
      </div>

      {/* Collapsible Analytics & Insights Drawer */}
      {isChartExpanded && (
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-medium">
              <button
                onClick={() => setActiveTab('distribution')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'distribution'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Milestone Distribution
              </button>
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'timeline'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Activity Timeline
              </button>
              <button
                onClick={() => setActiveTab('scheme')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'scheme'
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Certification Scheme
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Timeframe:</span>
              <div className="inline-flex border border-slate-200 bg-slate-50 rounded-md p-0.5 text-[11px] font-mono">
                {[7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setTimeWindowDays(d)}
                    className={`px-2 py-0.5 rounded transition-colors ${
                      timeWindowDays === d
                        ? 'bg-slate-900 text-white font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab 1: Distribution */}
          {activeTab === 'distribution' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-5 h-56 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(entry: any) => {
                        if (entry?.status) onFilterStatus(entry.status);
                      }}
                      className="cursor-pointer"
                    >
                      {statusDistributionData.map((entry) => (
                        <Cell key={`cell-${entry.status}`} fill={entry.color} stroke="#ffffff" strokeWidth={2} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {windowFilteredApps.length || total}
                  </span>
                  <span className="text-[10px] uppercase text-slate-400 font-medium">Active</span>
                </div>
              </div>

              <div className="lg:col-span-7 space-y-1.5">
                {statusDistributionData.map((item) => (
                  <div
                    key={item.status}
                    onClick={() => onFilterStatus(item.status)}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-medium text-slate-800 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-3 font-mono tabular-nums">
                      <span className="text-slate-600">{item.value}</span>
                      <span className="text-slate-400 w-8 text-right">{item.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 2: Timeline */}
          {activeTab === 'timeline' && (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="dateRange" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-slate-900 text-white p-2.5 rounded-lg text-xs space-y-1">
                          <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">{label}</div>
                          {payload.map((e: any) => (
                            <div key={e.name} className="flex justify-between gap-3 font-mono">
                              <span style={{ color: e.color }}>{e.name}:</span>
                              <span>{e.value}</span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} iconType="circle" iconSize={6} />
                  <Bar dataKey="Action Required" fill="#e11d48" stackId="a" />
                  <Bar dataKey="In Review" fill="#6366f1" stackId="a" />
                  <Bar dataKey="Approved" fill="#10b981" stackId="a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tab 3: Scheme */}
          {activeTab === 'scheme' && (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={schemeData} layout="vertical" margin={{ top: 10, right: 20, left: 30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#334155' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} width={130} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} iconType="circle" iconSize={6} />
                  <Bar dataKey="Action Required" fill="#e11d48" stackId="s" />
                  <Bar dataKey="In Review" fill="#6366f1" stackId="s" />
                  <Bar dataKey="Approved" fill="#10b981" stackId="s" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
