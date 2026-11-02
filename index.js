import makeWASocket, { useMultiFileAuthState, DisconnectReason } from "@whiskeysockets/baileys";
import cron from 'node-cron';
import qrcode from 'qrcode-terminal';

const PLAYERS = ["Akash","Rajeev","Pramod","Subodh","Mridul","Pranay","Kundan","Spy","Ankit","Avinash","Soumya","Peeyush","Manish","Rishu","Keshav","Sumit","Adarsh","Lokesh"];
let dues = {}; PLAYERS.forEach(p=>dues[p]=0);
let lastFee = 250;
const UPI = "8609276495";

function getDuesMsg(){
 let msg = `📊 *MATCH FEES - AUTO UPDATE* 📊\nDate: ${new Date().toLocaleDateString('en-IN')}\n\n`;
 let total=0;
 PLAYERS.forEach(p=>{
   if(dues[p]>0){msg+=`${p}: Rs ${dues[p]} pending\n`; total+=dues[p];}
   else{msg+=`${p}: CLEAR ✅\n`;}
 });
 msg+=`\nTotal Pending: Rs ${total}\nPay: ${UPI} (UPI/PhonePe)\n_Auto-detected from "done" messages_`;
 return msg;
}

async function startBot(){
 const { state, saveCreds } = await useMultiFileAuthState('auth');
 const sock = makeWASocket({ auth: state, printQRInTerminal: false });
 
 sock.ev.on('creds.update', saveCreds);
 
 sock.ev.on('connection.update', (update)=>{
   const { connection, lastDisconnect, qr } = update;
   if(qr){
     console.log("=== SCAN THIS QR WITH WHATSAPP ===");
     qrcode.generate(qr, {small: true});
   }
   if(connection === 'open') console.log("✅ BOT CONNECTED!");
 });

 sock.ev.on('messages.upsert', async ({messages})=>{
   const msg = messages[0];
   if(!msg.message || msg.key.fromMe) return;
   const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
   const sender = msg.pushName || "";
   const groupId = msg.key.remoteJid;
   
   console.log(`Msg from ${sender}: ${text}`);
   let reply = null;
   
   if(text.includes("new match")){
     let feeMatch = text.match(/\d+/);
     if(feeMatch){ lastFee = parseInt(feeMatch[0]); }
     let selected = PLAYERS.filter(p=> text.includes(p.toLowerCase()));
     if(selected.length==0) selected = PLAYERS.slice(0,12);
     selected.forEach(p=> dues[p]+=lastFee);
     reply = `✅ NEW MATCH FEE ADDED: Rs ${lastFee}\nTo: ${selected.join(", ")}\n\n` + getDuesMsg();
   }
   
   if((text.includes("done") || text.includes("paid")) && !text.includes("new match")){
     let player = PLAYERS.find(p=> sender.toLowerCase().includes(p.toLowerCase()) || text.includes(p.toLowerCase()));
     if(player && dues[player]>0){
       let amt = lastFee;
       let amtMatch = text.match(/\d+/);
       if(amtMatch && parseInt(amtMatch[0]) < 1000) amt = parseInt(amtMatch[0]);
       dues[player]-=amt;
       if(dues[player]<0) dues[player]=0;
       reply = `✅ Auto Payment Detected: ${player} paid Rs ${amt}\nRemaining: Rs ${dues[player]}\n\n` + getDuesMsg();
     }
   }

   if(reply){
     await sock.sendMessage(groupId, {text: reply});
   }
 });

 cron.schedule('30 15 * * *', async ()=>{
   try {
     let groups = await sock.groupFetchAllParticipating();
     for(let id in groups){
       await sock.sendMessage(id, {text: getDuesMsg()});
     }
   } catch(e){ console.log(e); }
 });
}

startBot();
