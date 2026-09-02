import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCheck,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  TrendingUp,
  PieChart as PieChartIcon,
  BarChart3,
  Calendar,
  Filter,
  Info,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
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
  AreaChart,
  Area,
} from 'recharts';
import { SirimApplication, SheetSyncConfig, SirimStatus } from '../types';

interface StatsBannerProps {
  applications: SirimApplication[];
  sheetConfig: SheetSyncConfig | null;
  onFilterStatus: (status: string) => void;
  onOpenSheetModal: () => void;
}

// Color palette for regulatory statuses
const STATUS_COLORS: Record<string, string> = {
  RFI_ACTION_REQUIRED: '#e11d48', // rose-600
  SAMPLE_REQUESTED: '#f59e0b', // amber-500
  PAYMENT_PENDING: '#d97706', // amber-600
  SUBMITTED: '#64748b', // slate-500
  UNDER_REVIEW: '#3b82f6', // blue-500
  SAMPLE_SUBMITTED: '#0284c7', // sky-600
  TESTING_IN_PROGRESS: '#6366f1', // indigo-500
  FINAL_EVALUATION: '#8b5cf6', // violet-500
  APPROVED: '#10b981', // emerald-500
  REJECTED: '#ef4444', // red-500
  EXPIRED: '#94a3b8', // slate-400
};

const CATEGORY_COLORS = {
  'Action Required': '#e11d48',
  'In Review / Testing': '#4f46e5',
  'Final Evaluation': '#8b5cf6',
  'Approved / Certified': '#10b981',
  'Payment / Formalities': '#f59e0b',
  'Others': '#94a3b8',
};

export const StatsBanner: React.FC<StatsBannerProps> = ({
  applications,
  sheetConfig,
  onFilterStatus,
  onOpenSheetModal,
}) => {
  const [isChartExpanded, setIsChartExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'distribution' | 'timeline' | 'scheme'>('distribution');
  const [timeWindowDays, setTimeWindowDays] = useState<number>(30);

  // 1. Overall counts
  const total = applications.length;
  const actionRequiredList = useMemo(
    () =>
      applications.filter(
        (app) =>
          ['RFI_ACTION_REQUIRED', 'SAMPLE_REQUESTED', 'PAYMENT_PENDING'].includes(app.status) ||
          app.actionItems.some((a) => !a.isCompleted && a.assignedTo === 'APPLICANT')
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
        ].includes(app.status)
      ),
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
        .filter((act) => !act.isCompleted && act.priority === 'CRITICAL'),
    [applications]
  );

  // 2. Filter applications within the selected window (default 30 days)
  const windowFilteredApps = useMemo(() => {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(now.getDate() - timeWindowDays);

    return applications.filter((app) => {
      // Check lastActivityDate, submissionDate or any timeline event
      const appDate = app.lastActivityDate
        ? new Date(app.lastActivityDate)
        : app.submissionDate
        ? new Date(app.submissionDate)
        : null;

      if (!appDate || isNaN(appDate.getTime())) return true;
      return appDate >= cutoffDate;
    });
  }, [applications, timeWindowDays]);

  // 3. Status Distribution Data for Pie/Donut Chart
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

  // 4. 30-Day Activity & Status Trend Data
  const timelineTrendData = useMemo(() => {
    // Generate 6 buckets of 5-day intervals across the last 30 days
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
        'In Review / Testing': inReviewCount,
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

  // Custom Pie Chart Tooltip
  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs font-sans max-w-xs z-50">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: data.color }}
            />
            <span className="font-bold text-slate-100">{data.name}</span>
          </div>
          <div className="text-slate-300 flex items-center justify-between gap-4 py-1 border-y border-slate-800">
            <span>Applications:</span>
            <span className="font-mono font-bold text-white text-sm">
              {data.value} ({data.percentage}%)
            </span>
          </div>
          {data.applications && data.applications.length > 0 && (
            <div className="mt-2 text-[11px] text-slate-400 space-y-0.5">
              <span className="text-[10px] uppercase font-semibold text-slate-500">
                Models in this stage:
              </span>
              <div className="truncate text-slate-300">
                {data.applications.slice(0, 2).map((a: SirimApplication) => a.modelNumber || a.applicationRef).join(', ')}
                {data.applications.length > 2 && ` +${data.applications.length - 2} more`}
              </div>
            </div>
          )}
          <p className="text-[10px] text-indigo-400 mt-2 font-medium">
            Click to filter table by this status
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom Timeline Tooltip
  const CustomTimelineTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs max-w-xs z-50">
          <p className="font-bold text-slate-200 mb-2 border-b border-slate-800 pb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            Interval: {label}
          </p>
          <div className="space-y-1.5 font-mono">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-slate-300 font-sans text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.name}:
                </span>
                <span className="font-bold text-white">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <section
      id="sirim-stats-banner-container"
      className="bg-white border border-slate-200 rounded-2xl shadow-xs mb-6 overflow-hidden transition-all"
    >
      {/* Top KPI Metrics Row */}
      <div className="px-6 py-5 flex flex-wrap lg:flex-nowrap items-center justify-between gap-6 border-b border-slate-100 bg-slate-50/40">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 flex-1">
          {/* Card 1: Total */}
          <div
            id="kpi-card-total"
            className="flex flex-col cursor-pointer group transition-all"
            onClick={() => onFilterStatus('ALL')}
            title="Click to view all applications"
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600" />
              Active Registry
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                {total}
              </span>
              <span className="text-[11px] font-medium text-slate-400">files</span>
            </div>
            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-0.5">
              <CheckCircle2 className="w-3 h-3" /> Real-time tracking
            </span>
          </div>

          {/* Card 2: Action Required */}
          <div
            id="kpi-card-action-required"
            className="flex flex-col cursor-pointer group transition-all"
            onClick={() => onFilterStatus('ACTION_REQUIRED')}
            title="Click to filter by Action Required"
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 group-hover:text-rose-600 transition-colors flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              Action Required
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-rose-600">
                {actionRequiredList.length}
              </span>
              <span className="text-[11px] font-medium text-slate-400">pending</span>
            </div>
            <span className="text-[11px] mt-0.5">
              {criticalItems.length > 0 ? (
                <span className="text-rose-600 font-bold flex items-center gap-0.5 animate-pulse">
                  {criticalItems.length} Urgent RFI / Sample
                </span>
              ) : (
                <span className="text-slate-400">Awaiting applicant</span>
              )}
            </span>
          </div>

          {/* Card 3: In Review */}
          <div
            id="kpi-card-in-review"
            className="flex flex-col cursor-pointer group transition-all"
            onClick={() => onFilterStatus('IN_PROGRESS')}
            title="Click to filter by In Progress / Evaluation"
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              SIRIM / Lab Review
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                {inReviewList.length}
              </span>
              <span className="text-[11px] font-medium text-slate-400">underway</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5">Technical evaluation</span>
          </div>

          {/* Card 4: Approved */}
          <div
            id="kpi-card-approved"
            className="flex flex-col cursor-pointer group transition-all"
            onClick={() => onFilterStatus('APPROVED')}
            title="Click to filter by Approved Certificates"
          >
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 group-hover:text-emerald-700 transition-colors flex items-center gap-1">
              <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
              CoC Approved
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold text-emerald-600">
                {approvedList.length}
              </span>
              <span className="text-[11px] font-medium text-slate-400">issued</span>
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5">Label purchasing active</span>
          </div>
        </div>

        {/* Toggle Visualizer Button */}
        <div className="flex items-center gap-2 self-start lg:self-center">
          <button
            id="btn-toggle-stats-visualization"
            onClick={() => setIsChartExpanded(!isChartExpanded)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
            <span>30-Day Distribution Chart</span>
            {isChartExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-indigo-500 ml-0.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-indigo-500 ml-0.5" />
            )}
          </button>
        </div>
      </div>

      {/* Visual Analytics Section (Interactive Recharts Visualization) */}
      {isChartExpanded && (
        <div id="stats-visualization-body" className="p-6 bg-white animate-in fade-in duration-200">
          {/* Controls & Tab Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                id="tab-chart-distribution"
                onClick={() => setActiveTab('distribution')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'distribution'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                Status Distribution (Last {timeWindowDays}d)
              </button>

              <button
                id="tab-chart-timeline"
                onClick={() => setActiveTab('timeline')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'timeline'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Activity Timeline Trend
              </button>

              <button
                id="tab-chart-scheme"
                onClick={() => setActiveTab('scheme')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  activeTab === 'scheme'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                By Scheme
              </button>
            </div>

            {/* Time Window Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                Window:
              </span>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {[
                  { label: '7D', days: 7 },
                  { label: '14D', days: 14 },
                  { label: '30D', days: 30 },
                  { label: '90D', days: 90 },
                ].map((item) => (
                  <button
                    key={item.days}
                    onClick={() => setTimeWindowDays(item.days)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${
                      timeWindowDays === item.days
                        ? 'bg-indigo-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* VIEW 1: Status Distribution (Donut Chart & Detailed Stage Breakdown) */}
          {activeTab === 'distribution' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Donut Chart Canvas */}
              <div className="lg:col-span-6 h-64 sm:h-72 relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusDistributionData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={96}
                      paddingAngle={3}
                      dataKey="value"
                      onClick={(entry: any) => {
                        if (entry && (entry.status || entry.payload?.status)) {
                          onFilterStatus(entry.status || entry.payload?.status);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {statusDistributionData.map((entry) => (
                        <Cell
                          key={`cell-${entry.status}`}
                          fill={entry.color}
                          stroke="#ffffff"
                          strokeWidth={2}
                          className="hover:opacity-85 transition-opacity"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomPieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>

                {/* Donut Center Summary */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-slate-800 font-mono">
                    {windowFilteredApps.length || total}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    Applications
                  </span>
                </div>
              </div>

              {/* Status Breakdown Legend & Interactive Filter Cards */}
              <div className="lg:col-span-6 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 font-semibold mb-1 uppercase tracking-wider">
                  <span>Current Milestone Breakdown</span>
                  <span>Share (% of Total)</span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {statusDistributionData.map((item) => (
                    <div
                      key={item.status}
                      id={`status-row-${item.status.toLowerCase()}`}
                      onClick={() => onFilterStatus(item.status)}
                      className="group p-2.5 rounded-xl border border-slate-100 hover:border-indigo-200 bg-slate-50/50 hover:bg-indigo-50/40 flex items-center justify-between cursor-pointer transition-all shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 shadow-2xs"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-900 transition-colors">
                            {item.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {item.applications.map((a) => a.modelNumber || a.applicationRef).slice(0, 2).join(', ')}
                            {item.applications.length > 2 ? ` +${item.applications.length - 2}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200 shadow-2xs">
                          {item.value} {item.value === 1 ? 'file' : 'files'}
                        </span>
                        <span className="text-xs font-mono font-bold text-indigo-600 w-10 text-right">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <Info className="w-3 h-3 text-slate-400" />
                    Click any milestone above to filter the register table.
                  </span>
                  <button
                    onClick={() => onFilterStatus('ALL')}
                    className="text-indigo-600 hover:underline font-semibold"
                  >
                    Reset Filter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 2: 30-Day Activity & Progress Timeline (Stacked Bar Chart) */}
          {activeTab === 'timeline' && (
            <div className="space-y-3">
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={timelineTrendData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="dateRange"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip content={<CustomTimelineTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar
                      dataKey="Action Required"
                      fill="#e11d48"
                      radius={[0, 0, 0, 0]}
                      stackId="a"
                    />
                    <Bar
                      dataKey="In Review / Testing"
                      fill="#4f46e5"
                      radius={[0, 0, 0, 0]}
                      stackId="a"
                    />
                    <Bar
                      dataKey="Approved"
                      fill="#10b981"
                      radius={[4, 4, 0, 0]}
                      stackId="a"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Visualizing applications active, updated, or reaching milestones over 5-day intervals across the selected {timeWindowDays}-day period.
              </p>
            </div>
          )}

          {/* VIEW 3: By Certification Scheme Breakdown */}
          {activeTab === 'scheme' && (
            <div className="space-y-3">
              <div className="h-64 sm:h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={schemeData}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 40, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                      width={140}
                    />
                    <Tooltip
                      content={({ active, payload, label }: any) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs max-w-xs z-50">
                              <p className="font-bold text-slate-100 mb-1.5">{label}</p>
                              <div className="space-y-1 font-mono text-[11px]">
                                {payload.map((entry: any) => (
                                  <div key={entry.name} className="flex justify-between gap-4">
                                    <span style={{ color: entry.color }}>{entry.name}:</span>
                                    <span className="font-bold text-white">{entry.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar dataKey="Action Required" fill="#e11d48" stackId="s" />
                    <Bar dataKey="In Review" fill="#4f46e5" stackId="s" />
                    <Bar dataKey="Approved" fill="#10b981" radius={[0, 4, 4, 0]} stackId="s" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-slate-500 text-center">
                Distribution across MCMC Type Approval, Modular Approval, Special Approval, and Safety & EMC schemes.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
