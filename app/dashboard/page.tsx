"use client";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Wallet,
  Clock,
  Users,
  Package,
  TrendingUp,
  FileBarChart,
  BarChart3,
  CalendarDays,
  Filter,
  Gift,
} from "lucide-react";

// --- Interface Definisi Data ---
interface DashboardStats {
  omzetKotor: number;
  dibayarKePusat: number;
  piutangMitra: number;
  omzetKonsumen: number;
  totalMitra: number;
  biayaSample: number;
}
interface ProductAudit {
  name: string;
  stokAwal: number;
  barangKeluar: number;
  sisaStok: number;
  status: string;
}
interface TransactionItemJoin {
  qty: number;
  remaining_qty_at_partner: number;
  product_id: string;
  product: { name: string; base_price: number } | null;
  transactions: {
    id: string;
    mitra: { id: string; full_name: string; current_tier: string } | null;
    payment_method: string;
    payment_status: string;
    paid_amount: number;
    total_amount: number;
    created_at: string;
    is_sample: boolean;
  } | null;
}
interface PartnerReportJoin {
  mitra_id: string;
  product: { name: string } | null;
  qty: number;
  selling_price: number;
  created_at: string;
}
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  highlight?: boolean;
  isCurrency?: boolean;
}

interface ExcelKasRow {
  "NO": number | string;
  "TANGGAL": string;
  "MITRA": string;
  "STATUS": string;
  "DIBAYAR KE PUSAT": string;
  "SISA PIUTANG": string;
}

export default function ExecutiveDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedMonth = useMemo(
    () => Number(searchParams.get("month")) || new Date().getMonth() + 1,
    [searchParams],
  );

  const selectedYear = useMemo(
    () => Number(searchParams.get("year")) || new Date().getFullYear(),
    [searchParams],
  );

  const [stats, setStats] = useState<DashboardStats>({
    omzetKotor: 0,
    dibayarKePusat: 0,
    piutangMitra: 0,
    omzetKonsumen: 0,
    totalMitra: 0,
    biayaSample: 0,
  });
  const [auditStok, setAuditStok] = useState<ProductAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [rawTransactionItems, setRawTransactionItems] = useState<
    TransactionItemJoin[]
  >([]);
  const [rawPartnerReports, setRawPartnerReports] = useState<
    PartnerReportJoin[]
  >([]);

  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const years = [2026];

  const updateURL = (month: number, year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", month.toString());
    params.set("year", year.toString());
    router.push(`${window.location.pathname}?${params.toString()}`);
  };

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    const startOfMonth = new Date(
      selectedYear,
      selectedMonth - 1,
      1,
      0,
      0,
      0,
      0,
    ).toISOString();
    const endOfMonth = new Date(
      selectedYear,
      selectedMonth,
      0,
      23,
      59,
      59,
      999,
    ).toISOString();

    const [reportsRes, prodsRes, itemsRes, mitraRes] = await Promise.all([
      supabase
        .from("partner_reports")
        .select(
          "qty, selling_price, mitra_id, created_at, product:product_id(name)",
        )
        .gte("created_at", startOfMonth)
        .lte("created_at", endOfMonth),
      supabase.from("products").select("*"),
      supabase
        .from("transaction_items")
        .select(
          `
          qty, product_id, remaining_qty_at_partner, 
          product:product_id(name, base_price), 
          transactions!inner(id, created_at, payment_method, payment_status, paid_amount, total_amount, is_sample, mitra:mitra_id(id, full_name, current_tier))
        `,
        )
        .gte("transactions.created_at", startOfMonth)
        .lte("transactions.created_at", endOfMonth),
      supabase.from("mitra").select("id", { count: "exact", head: true }),
    ]);

    if (prodsRes.data && reportsRes.data && itemsRes.data) {
      const items = itemsRes.data as unknown as TransactionItemJoin[];
      const reports = reportsRes.data as unknown as PartnerReportJoin[];
      setRawPartnerReports(reports);
      setRawTransactionItems(items);

      const totalPaid = items
        .filter((i) => !i.transactions?.is_sample)
        .reduce((a, c) => a + (c.transactions?.paid_amount || 0), 0);
      const totalUnpaid = items
        .filter((i) => !i.transactions?.is_sample)
        .reduce((a, c) => a + (c.transactions?.total_amount || 0), 0);
      const totalOmzetMitra = reports.reduce(
        (a, c) => a + c.selling_price * c.qty,
        0,
      );
      const costSample = items
        .filter((i) => i.transactions?.is_sample)
        .reduce(
          (acc, curr) => acc + curr.qty * (curr.product?.base_price || 0),
          0,
        );
      const totalBruto = items
        .filter((i) => !i.transactions?.is_sample)
        .reduce(
          (acc, curr) => acc + curr.qty * (curr.product?.base_price || 0),
          0,
        );

      setStats({
        omzetKotor: totalBruto,
        dibayarKePusat: totalPaid,
        piutangMitra: totalUnpaid,
        omzetKonsumen: totalOmzetMitra,
        totalMitra: mitraRes.count || 0,
        biayaSample: costSample,
      });

      setAuditStok(
        prodsRes.data.map((p) => {
          const keluarPeriodeIni = items
            .filter((item) => item.product_id === p.id)
            .reduce((acc, curr) => acc + curr.qty, 0);
          return {
            name: p.is_active ? p.name : `${p.name} (OFF)`,
            stokAwal: p.stock + keluarPeriodeIni,
            barangKeluar: keluarPeriodeIni,
            sisaStok: p.stock,
            status: p.stock < 10 ? "KRITIS" : p.stock < 50 ? "MENIPIS" : "AMAN",
          };
        }),
      );
    }
    setLoading(false);
  }, [supabase, selectedMonth, selectedYear]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      if (isMounted) {
        await fetchDashboardData();
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [fetchDashboardData]);

  const toIDR = (num: number) => `Rp ${num.toLocaleString("id-ID")}`;

  const downloadMasterReport = () => {
    if (rawTransactionItems.length === 0)
      return alert("Data periode ini masih kosong!");
    const wb = XLSX.utils.book_new();

    // --- SHEET 1: RINGKASAN ARUS KAS ---
    const activeItems = rawTransactionItems.filter(
      (i) => !i.transactions?.is_sample,
    );
    const dataKas: ExcelKasRow[] = activeItems.map((item, idx) => ({
      "NO": idx + 1,
      "TANGGAL": new Date(
        item.transactions?.created_at || "",
      ).toLocaleDateString("id-ID"),
      "MITRA": item.transactions?.mitra?.full_name || "N/A",
      "STATUS": item.transactions?.payment_status || "N/A",
      "DIBAYAR KE PUSAT": toIDR(item.transactions?.paid_amount || 0),
      "SISA PIUTANG": toIDR(item.transactions?.total_amount || 0),
    }));

    dataKas.push({
      "NO": "",
      "TANGGAL": "TOTAL AKUMULASI",
      "MITRA": "",
      "STATUS": "",
      "DIBAYAR KE PUSAT": toIDR(stats.dibayarKePusat),
      "SISA PIUTANG": toIDR(stats.piutangMitra),
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataKas),
      "1. Arus Kas",
    );

    // --- SHEET 2: AUDIT STOK ---
    const dataAudit = auditStok.map((item) => ({
      "PRODUK": item.name,
      "STOK AWAL PERIODE": item.stokAwal,
      "BARANG KELUAR": item.barangKeluar,
      "SISA STOK GUDANG": item.sisaStok,
      "STATUS": item.status,
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataAudit),
      "2. Audit Stok",
    );

    // --- SHEET 3: DATA MITRA & KOMISI ---
    const uniqueMitraIds = Array.from(
      new Set(activeItems.map((i) => i.transactions?.mitra?.id)),
    );
    const commissionMap: Record<string, string> = {
      "Member": "0%",
      "Reseller": "15%",
      "Sub-Agen": "25%",
      "Agen": "35%",
      "Distributor": "45%",
    };
    const dataMitra = uniqueMitraIds.map((id, idx) => {
      const m = activeItems.find((i) => i.transactions?.mitra?.id === id)
        ?.transactions?.mitra;
      return {
        "NO": idx + 1,
        "NAMA MITRA": m?.full_name || "N/A",
        "TIER LEVEL": m?.current_tier || "N/A",
        "DISKON KOMISI": commissionMap[m?.current_tier || ""] || "0%",
      };
    });
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataMitra),
      "3. Data Mitra",
    );

    // --- SHEET 4: INDIVIDUAL MITRA ---
    uniqueMitraIds.forEach((mId) => {
      if (!mId) return;
      const mTrans = activeItems.filter(
        (i) => i.transactions?.mitra?.id === mId,
      );
      const mReports = rawPartnerReports.filter((r) => r.mitra_id === mId);
      const mName = mTrans[0].transactions?.mitra?.full_name || "Unknown";

      const detailRows = mTrans.map((f, i) => {
        const report = mReports.find(
          (r) => r.product?.name === f.product?.name,
        );
        return {
          "NO": i + 1,
          "TANGGAL": new Date(
            f.transactions?.created_at || "",
          ).toLocaleDateString("id-ID"),
          "PRODUK": f.product?.name || "N/A",
          "QTY DIAMBIL": f.qty,
          "STOK DI TANGAN": f.remaining_qty_at_partner,
          "OMZET PENJUALAN": toIDR(
            report ? report.qty * report.selling_price : 0,
          ),
          "MODAL KE PUSAT": toIDR(f.transactions?.paid_amount || 0),
          "PIUTANG": toIDR(f.transactions?.total_amount || 0),
        };
      });
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(detailRows),
        `${mName}`.substring(0, 31),
      );
    });

    // --- SHEET 5: RIWAYAT SAMPLE ---
    const sampleItems = rawTransactionItems.filter(
      (i) => i.transactions?.is_sample,
    );
    const dataSample = sampleItems.map((item, idx) => ({
      "NO": idx + 1,
      "TANGGAL": new Date(
        item.transactions?.created_at || "",
      ).toLocaleDateString("id-ID"),
      "PRODUK": item.product?.name || "N/A",
      "QTY": item.qty,
      "ESTIMASI VALUE": toIDR(item.qty * (item.product?.base_price || 0)),
    }));
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(dataSample),
      "5. Riwayat Sample",
    );

    XLSX.writeFile(
      wb,
      `TRUJIVA_MASTER_REPORT_${months[selectedMonth - 1]}_${selectedYear}.xlsx`,
    );
  };

  if (loading)
    return (
      <div className="p-20 text-center font-black animate-pulse text-green-800 uppercase italic">
        Syncing Dashboard {months[selectedMonth - 1]}...
      </div>
    );

  return (
    <div className="p-8 max-w-7xl mx-auto font-sans text-gray-900">
      <header className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h1 className="text-4xl font-black text-green-900 italic uppercase tracking-tighter">
            Executive Dashboard
          </h1>
          <div className="flex items-center gap-2 text-orange-600 mt-1">
            <CalendarDays size={16} />
            <p className="text-[10px] font-black uppercase tracking-widest">
              Periode Aktif: {months[selectedMonth - 1]} {selectedYear}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl shadow-sm border border-gray-100">
            <Filter size={14} className="text-green-800" />
            <select
              value={selectedMonth}
              onChange={(e) => updateURL(Number(e.target.value), selectedYear)}
              className="text-xs font-black uppercase outline-none bg-transparent cursor-pointer"
            >
              {months.map((m, i) => {
                const monthIndex = i + 1;
                if (
                  monthIndex > new Date().getMonth() + 1 &&
                  selectedYear === new Date().getFullYear()
                )
                  return null;
                return (
                  <option key={m} value={monthIndex}>
                    {m}
                  </option>
                );
              })}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => updateURL(selectedMonth, Number(e.target.value))}
              className="text-xs font-black uppercase outline-none bg-transparent cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={downloadMasterReport}
            className="bg-green-900 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-xl hover:scale-105 transition-all"
          >
            <FileBarChart size={18} /> Master Report (Excel)
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-12">
        <StatCard
          title="Bruto Keluar"
          value={stats.omzetKotor}
          icon={<BarChart3 className="text-orange-500" />}
          color="bg-orange-50"
        />
        <StatCard
          title="Kas Masuk"
          value={stats.dibayarKePusat}
          icon={<Wallet className="text-green-600" />}
          color="bg-green-50"
          highlight
        />
        <StatCard
          title="Sisa Piutang"
          value={stats.piutangMitra}
          icon={<Clock className="text-red-500" />}
          color="bg-red-50"
        />
        <StatCard
          title="Omzet Mitra"
          value={stats.omzetKonsumen}
          icon={<TrendingUp className="text-purple-500" />}
          color="bg-purple-50"
        />
        <StatCard
          title="Biaya Sample"
          value={stats.biayaSample}
          icon={<Gift className="text-blue-500" />}
          color="bg-blue-50"
        />
        <StatCard
          title="Total Mitra"
          value={stats.totalMitra}
          icon={<Users className="text-gray-500" />}
          color="bg-gray-50"
          isCurrency={false}
        />
      </div>

      <div className="bg-white rounded-[40px] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
          <h2 className="text-xl font-black text-green-900 italic uppercase flex items-center gap-2">
            <Package size={24} /> Audit Stok Gudang
          </h2>
          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
            Update Real-time
          </span>
        </div>
        <div className="p-8 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest border-b">
                <th className="pb-6">Produk</th>
                <th className="pb-6">Est. Stok Awal</th>
                <th className="pb-6 text-red-500">Keluar Bln Ini</th>
                <th className="pb-6 text-green-700">Sisa Stok</th>
                <th className="pb-6 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {auditStok.map((item, idx) => (
                <tr
                  key={idx}
                  className="group hover:bg-gray-50/50 transition-all"
                >
                  <td className="py-6 font-black text-gray-700 uppercase italic">
                    {item.name}
                  </td>
                  <td className="py-6 font-bold text-gray-400">
                    {item.stokAwal}
                  </td>
                  <td className="py-6 font-black text-red-500">
                    -{item.barangKeluar}
                  </td>
                  <td className="py-6 font-black text-green-700 text-lg">
                    {item.sisaStok}
                  </td>
                  <td className="py-6 text-center">
                    <span
                      className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${item.status === "AMAN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                    >
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  highlight = false,
  isCurrency = true,
}: StatCardProps) {
  return (
    <div
      className={`p-5 rounded-[25px] border border-gray-100 shadow-sm transition-all hover:-translate-y-1 ${highlight ? "ring-2 ring-green-500/20 bg-white" : "bg-white"}`}
    >
      <div
        className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center mb-3`}
      >
        {icon}
      </div>
      <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
        {title}
      </p>
      <h3
        className={`text-lg font-black tracking-tighter ${highlight ? "text-green-700" : "text-gray-900"}`}
      >
        {isCurrency ? `Rp ${value.toLocaleString("id-ID")}` : value}
      </h3>
    </div>
  );
}
