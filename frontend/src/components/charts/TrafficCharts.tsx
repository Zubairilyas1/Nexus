'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { TrendingUp, TrendingDown, Minus, Car, Truck, Bus, Bike, User as Person, Clock, AlertTriangle } from 'lucide-react';

interface TrafficDataPoint {
  hour: string;
  cars: number;
  trucks: number;
  buses: number;
  motorcycles: number;
  bicycles: number;
  pedestrians: number;
  total: number;
}

interface VehicleDistribution {
  type: string;
  count: number;
  percentage: number;
  color: string;
}

interface DwellDataPoint {
  zone: string;
  avgDwellMs: number;
  maxDwellMs: number;
  violations: number;
}

interface TrafficChartsProps {
  hourlyData: TrafficDataPoint[];
  vehicleDistribution: VehicleDistribution[];
  dwellData: DwellDataPoint[];
  totalVehicles: number;
  peakHour: { hour: string; count: number };
  avgDwellTime: number;
  violationRate: number;
  className?: string;
}

const VEHICLE_COLORS = {
  cars: '#06b6d4',
  trucks: '#f97316',
  buses: '#a855f7',
  motorcycles: '#22c55e',
  bicycles: '#eab308',
  pedestrians: '#ec4899',
};

const VEHICLE_LABELS = {
  cars: 'Cars',
  trucks: 'Trucks',
  buses: 'Buses',
  motorcycles: 'Motorcycles',
  bicycles: 'Bicycles',
  pedestrians: 'Pedestrians',
};

const VEHICLE_ICONS = {
  cars: 'Car',
  trucks: 'Truck',
  buses: 'Bus',
  motorcycles: 'Bike',
  bicycles: 'Bike',
  pedestrians: 'Person',
};

function TrendIndicator({ value, label }: { value: number; label: string }) {
  const isPositive = value >= 0;
  return (
    <div className="flex items-center gap-1">
      {isPositive ? (
        <TrendingUp className="h-4 w-4 text-status-online" />
      ) : (
        <TrendingDown className="h-4 w-4 text-status-destructive" />
      )}
      <span className="text-sm font-medium">{Math.abs(value).toFixed(1)}%</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  trendLabel,
  color = 'primary',
  className
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  trend?: number;
  trendLabel?: string;
  color?: 'primary' | 'success' | 'warning' | 'destructive';
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn('card-hover p-5', className)}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-caption text-muted-foreground">{title}</p>
          <p className="text-heading-lg font-bold text-foreground mt-1">{value}</p>
          {trend !== undefined && (
            <TrendIndicator value={trend} label={trendLabel || 'vs last hour'} />
          )}
        </div>
        <div className={cn('p-3 rounded-xl', `bg-${color}/15 text-${color}`)}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </motion.div>
  );
}

function HourlyTrafficChart({ data }: { data: TrafficDataPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="h-80">
        <CardContent className="flex h-full items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p>No hourly data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Hourly Traffic Volume</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="hour" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}:00`}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value >= 1000 ? `${(value/1000).toFixed(1)}k` : value}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
              }}
              formatter={(value: number, name: string) => [value.toLocaleString(), name]}
              labelFormatter={(value) => `${value}:00`}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }}
              iconSize={12}
              layout="horizontal"
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Total Vehicles"
              stroke="hsl(var(--primary))"
              fillOpacity={1}
              fill="url(#colorTotal)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="cars"
              name="Cars"
              stroke={VEHICLE_COLORS.cars}
              fillOpacity={1}
              fill="url(#colorCars)"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="trucks"
              name="Trucks"
              stroke={VEHICLE_COLORS.trucks}
              fillOpacity={1}
              fill="url(#colorTrucks)"
              strokeWidth={1.5}
            />
            <Area
              type="monotone"
              dataKey="buses"
              name="Buses"
              stroke={VEHICLE_COLORS.buses}
              fillOpacity={1}
              fill="url(#colorBuses)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function VehicleDistributionChart({ data, total }: { data: VehicleDistribution[]; total: number }) {
  if (!data || data.length === 0) {
    return (
      <Card className="h-80">
        <CardContent className="flex h-full items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p>No vehicle distribution data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const COLORS = [
    VEHICLE_COLORS.cars,
    VEHICLE_COLORS.trucks,
    VEHICLE_COLORS.buses,
    VEHICLE_COLORS.motorcycles,
    VEHICLE_COLORS.bicycles,
    VEHICLE_COLORS.pedestrians,
  ];

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Vehicle Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex h-full">
          <ResponsiveContainer width="50%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                dataKey="count"
                nameKey="type"
                label={({ type, percentage }) => `${type} ${(percentage * 100).toFixed(1)}%`}
                labelLine={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                formatter={(value: number) => [value.toLocaleString(), 'vehicles']}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
                layout="vertical"
                align="right"
                verticalAlign="middle"
              />
            </PieChart>
          </ResponsiveContainer>
          
          <div className="w-1/2 p-4 overflow-y-auto">
            <h4 className="font-medium text-sm mb-3">Breakdown</h4>
            <div className="space-y-3">
              {data.map((item, index) => (
                <motion.div
                  key={item.type}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-center gap-3"
                >
                  <div 
                    className="h-3 w-3 rounded-full" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{item.count.toLocaleString()}</span>
                      <span className="text-primary font-medium">{item.percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="w-20 text-right text-sm font-medium">
                    {((item.count / total) * 100).toFixed(1)}%
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DwellTimeChart({ data }: { data: DwellDataPoint[] }) {
  if (!data || data.length === 0) {
    return (
      <Card className="h-80">
        <CardContent className="flex h-full items-center justify-center">
          <div className="text-center text-muted-foreground">
            <p>No dwell time data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle>Dwell Time by Zone</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis dataKey="zone" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={100} />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number) => [value > 60000 ? `${(value/60000).toFixed(1)} min` : `${value} ms`, '']}
              labelFormatter={(value) => value}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} layout="horizontal" />
            <Bar
              dataKey="avgDwellMs"
              name="Avg Dwell"
              fill="hsl(var(--primary))"
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="maxDwellMs"
              name="Max Dwell"
              fill="hsl(var(--status-warning))"
              radius={[0, 4, 4, 0]}
            />
            <Bar
              dataKey="violations"
              name="Violations"
              fill="hsl(var(--destructive))"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function SummaryStats({ 
  totalVehicles, 
  peakHour, 
  avgDwellTime, 
  violationRate 
}: { 
  totalVehicles: number; 
  peakHour: { hour: string; count: number };
  avgDwellTime: number;
  violationRate: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <MetricCard
        title="Total Vehicles"
        value={totalVehicles.toLocaleString()}
        icon={Car}
        color="primary"
      />
      <MetricCard
        title="Peak Hour"
        value={`${peakHour.hour}:00`}
        icon={TrendingUp}
        trend={12.5}
        trendLabel="vs yesterday"
        color="success"
      />
      <MetricCard
        title="Avg Dwell Time"
        value={`${(avgDwellTime / 1000 / 60).toFixed(1)} min`}
        icon={Clock}
        trend={-8.2}
        trendLabel="vs last week"
        color="warning"
      />
      <MetricCard
        title="Violation Rate"
        value={`${violationRate.toFixed(1)}%`}
        icon={AlertTriangle}
        trend={2.1}
        trendLabel="vs last week"
        color="destructive"
      />
    </div>
  );
}

function VehicleTypeLegend() {
  const types = [
    { key: 'cars', label: 'Cars', icon: Car },
    { key: 'trucks', label: 'Trucks', icon: Truck },
    { key: 'buses', label: 'Buses', icon: Bus },
    { key: 'motorcycles', label: 'Motorcycles', icon: Bike },
    { key: 'bicycles', label: 'Bicycles', icon: Bike },
    { key: 'pedestrians', label: 'Pedestrians', icon: Person },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {types.map(({ key, label, icon: Icon }) => (
        <div key={key} className="flex items-center gap-2">
          <div 
            className="h-3 w-3 rounded-full" 
            style={{ backgroundColor: VEHICLE_COLORS[key as keyof typeof VEHICLE_COLORS] }}
          />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function TrafficCharts({
  hourlyData = [],
  vehicleDistribution = [],
  dwellData = [],
  totalVehicles = 0,
  peakHour = { hour: '0', count: 0 },
  avgDwellTime = 0,
  violationRate = 0,
  className,
}: TrafficChartsProps) {
  return (
    <TooltipProvider>
      <div className={cn('space-y-6', className)}>
        <SummaryStats
          totalVehicles={totalVehicles}
          peakHour={peakHour}
          avgDwellTime={avgDwellTime}
          violationRate={violationRate}
        />

        <VehicleTypeLegend />

        <div className="flex flex-col gap-6">
          <HourlyTrafficChart data={hourlyData} />
          <VehicleDistributionChart data={vehicleDistribution} total={totalVehicles} />
        </div>

        <DwellTimeChart data={dwellData} />
      </div>
    </TooltipProvider>
  );
}

export default TrafficCharts;

