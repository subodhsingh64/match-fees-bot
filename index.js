const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const cron = require('node-cron');

const PLAYERS = ["Akash","Rajeev","Pramod","Subodh","Mridul","Pranay","Kundan","Spy","Ankit","Avinash","Soumya","Peeyush","Manish","Rishu","Keshav","Sumit","Adarsh","Lokesh"];
let dues = {}; PLAYERS.forEach(p=>dues[p]=0);
let lastFee = 250;
const GROUP_ID = ""; // Will auto-detect first group
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
 const sock = makeWASocket({ auth: state, printQRInTerminal: true });
 
 sock.ev.on('creds.update', saveCreds);
 
 sock.ev.on('connection.update', (update)=>{
   if(update.qr){ console.log("SCAN QR:", update.qr); }
 });

 sock.ev.on('messages.upsert', async ({messages})=>{
   const msg = messages[0];
   if(!msg.message || msg.key.fromMe) return;
   const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").toLowerCase();
   const sender = msg.pushName || "";
   const groupId = msg.key.remoteJid;
   
   console.log(`Msg from ${sender}: ${text}`);
   
   let reply = null;
   
   // TRIGGER 1: New Match
   if(text.includes("new match")){
     let feeMatch = text.match(/\d+/);
     if(feeMatch){ lastFee = parseInt(feeMatch[0]); }
     let selected = PLAYERS.filter(p=> text.includes(p.toLowerCase()));
     if(selected.length==0) selected = PLAYERS.slice(0,12); // default first 12 if no names
     selected.forEach(p=> dues[p]+=lastFee);
     reply = `✅ NEW MATCH FEE ADDED: Rs ${lastFee}\nTo: ${selected.join(", ")}\n\n` + getDuesMsg();
   }
   
   // TRIGGER 2: Auto-detect "done" / "paid"
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

 // Daily 9 PM IST (3:30 PM UTC) auto broadcast
 cron.schedule('30 15 * * *', async ()=>{
   let groups = await sock.groupFetchAllParticipating();
   for(let id in groups){
     await sock.sendMessage(id, {text: getDuesMsg()});
   }
 });
}

startBot();
