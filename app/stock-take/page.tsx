'use client';
import { useState } from 'react';
import { sendScan } from '@/lib/sheet';
export default function StockTake(){const [shelf,setShelf]=useState('');const [code,setCode]=useState('');const [qty,setQty]=useState('1');const [message,setMessage]=useState('');async function save(){const n=Number(qty);if(!shelf||!code||!Number.isFinite(n)||n<0){setMessage('Lengkapi Shelf, Scan Code, dan Qty valid.');return;}
                                                                                                                                                                                                         const result=await sendScan({
  id: `stock-take-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  shelf,
  barcode: code,
  format: `STOCK_TAKE_QTY:${n}`,
  timestamp: new Date().toISOString()
});
                                                                                                                                                                                                         setMessage(result.ok?'Terkirim ke Sheet':'Gagal terkirim—data belum masuk ke Sheet');if(result.ok){setShelf('');setCode('');setQty('1');}}return <main className="max-w-[480px] min-h-screen mx-auto p-4"><header className="bg-indigo-950 text-white rounded-2xl p-4"><a href="/">← Menu Utama</a><h1 className="font-black text-2xl mt-2">STOCK TAKE</h1></header><section className="mt-4 bg-white rounded-2xl border p-4 space-y-3"><label className="font-bold">Shelf</label><input value={shelf} onChange={(e)=>setShelf(e.target.value)} placeholder="Shelf" className="border-2 rounded-xl p-3 w-full"/><label className="font-bold">Scan Code</label><input value={code} onChange={(e)=>setCode(e.target.value)} placeholder="Barcode" className="border-2 rounded-xl p-3 w-full"/><label className="font-bold">Qty</label><input type="number" min="0" value={qty} onChange={(e)=>setQty(e.target.value)} className="border-2 rounded-xl p-3 w-full"/><button onClick={()=>void save()} className="w-full bg-teal-600 text-white rounded-xl p-3 font-bold">Simpan Stock Take</button>{message&&<div className="rounded-lg bg-slate-100 p-3 text-sm">{message}</div>}<p className="text-xs text-slate-500">Stock take disimpan melalui endpoint Sheet yang sama. Qty disisipkan pada kolom Format Lengkap.</p></section></main>}
