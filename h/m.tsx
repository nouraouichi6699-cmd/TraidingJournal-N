import { createRoot } from "react-dom/client";
import "../src/index.css";
import DashboardView from "../src/components/DashboardView";
import { makeT } from "../src/i18n";
import { setDashEdit } from "../src/useDashEdit";
const trades:any[]=[];
for(let i=0;i<40;i++){const d=new Date(Date.UTC(2026,8,1+i%25,8+i%9));trades.push({id:""+i,symbol:["EURUSD","XAUUSD"][i%2],side:i%3?"long":"short",qty:0.1*(1+i%4),entryTime:d.toISOString().slice(0,16),exitTime:d.toISOString().slice(0,16),pnl:(i%5-1.6)*40,status:"closed",accountId:"a"});}
document.documentElement.className="theme-black";
(window as any).edit=setDashEdit;
createRoot(document.getElementById("r")!).render(<div className="bg-bg text-text min-h-screen p-4"><DashboardView t={makeT("en")} lang="en" trades={trades}/></div>);
