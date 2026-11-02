import makeWASocket, { useMultiFileAuthState } from "@whiskeysockets/baileys";
import express from 'express';
import cron from 'node-cron';
import qrcode from 'qrcode-terminal';

const app = express();
app.get('/', (req,res)=>res.send('Bot Running - Check Logs for Group IDs'));
app.listen(process.env.PORT || 10000, ()=>console.log("Web server running"));

// === CONFIG - ADD YOUR 2 GROUP NAMES HERE FOR NOW ===
const ALLOWED_GROUP_NAMES = ["Match Fees", "test"]; // Put exact WhatsApp group names - case insensitive

const PLAYERS = ["Akash","Rajeev","Pramod","Subodh","Mridul","Pranay","Kundan","Spy","Ankit","Avinash","Soumya","Peeyush","Manish","Rishu","Keshav","Sumit","Adarsh","Lokesh"];
let dues = {}; PLAYERS.forEach(p=>dues[p]=0);
let lastFee = 250;
const UPI = "8609276495";

function getDuesMsg(){
 let msg = `📊 *MATCH FEES - AUTO UPDATE* 📊\n${new Date().toLocaleDateString('en-IN')}\n\n`;
 let total=0;
 PLAYERS.forEach(p=>{ if(dues[p]>0){msg+=`${p}: Rs ${dues[p]}\n`; total+=dues[p];} else {msg+=`${p}: CLEAR ✅\n`;}});
 msg+=`\nTotal Pending: Rs ${total}\nPay: ${UPI}`;
 return msg;
}

async function startBot(){
 const { state, saveCreds } = await useMultiFileAuthState('auth');
 const sock = makeWASocket({ auth: state, printQRInTerminal:false, syncFullHistory:false, shouldSyncHistoryMessage:()=>false });
 sock.ev.on('creds.update', saveCreds);
 
 sock.ev.on('connection.update', async (u)=>{
   const {connection, qr} = u;
   if(qr){ console.log("=== SCAN QR ==="); qrcode.generate(qr,{small:true});}
   if(connection==='open'){
     console.log("✅ BOT CONNECTED! Fetching groups...");
     try{
       let groups = await sock.groupFetchAllParticipating();
       console.log("======== YOUR GROUPS LIST ========");
       for(let id in groups){
         console.log(`GROUP NAME: "${groups[id].subject}" | GROUP ID: ${id}`);
       }
       console.log("======== END LIST ========");
     }catch(e){console.log("Error fetching groups",e);}
   }
   if(connection==='close') setTimeout(startBot,5000);
 });

 sock.ev.on('messages.upsert', async ({messages})=>{
   const m = messages[0];
   if(!m.message || m.key.fromMe) return;
   const text = (m.message.conversation || m.message.extendedTextMessage?.text || "");
   const textLower = text.toLowerCase();
   const senderName = m.pushName || "Unknown";
   const groupId = m.key.remoteJid;
   
   // Get group name to filter
   let groupName = "";
   try { let meta = await sock.groupMetadata(groupId); groupName = meta.subject; } catch(e){}

   console.log(`MSG in [${groupName}] from [${senderName}]: ${text} | ID: ${groupId}`);

   // === FILTER: Only allow specific groups ===
   let allowed = ALLOWED_GROUP_NAMES.some(n=> groupName.toLowerCase().includes(n.toLowerCase()));
   if(!allowed) { console.log(` -> Ignored (not in allowed list)`); return; }

   let reply = null;
   if(textLower.includes("new match")){
     let feeMatch = text.match(/\d+/);
     if(feeMatch) lastFee = parseInt(feeMatch[0]);
     let selected = PLAYERS.filter(p=> textLower.includes(p.toLowerCase()));
     if(selected.length==0) selected = PLAYERS.slice(0,12);
     selected.forEach(p=> dues[p]+=lastFee);
     reply = `✅ NEW MATCH: Rs ${lastFee} to ${selected.join(", ")}\n\n`+getDuesMsg();
   }

   if((textLower.includes("done") || textLower.includes("paid")) && !textLower.includes("new match")){
     // Identify player by WhatsApp name
     let player = PLAYERS.find(p=> senderName.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(senderName.toLowerCase())) 
                  || PLAYERS.find(p=> textLower.includes(p.toLowerCase()));
     if(player){
       dues[player]-=lastFee; if(dues[player]<0) dues[player]=0;
       reply = `✅ Payment: ${player} (${senderName}) paid Rs ${lastFee}. Remaining Rs ${dues[player]}\n\n`+getDuesMsg();
     } else {
       console.log(` -> Could not map sender ${senderName} to a player`);
       // Optionally reply to ask who
       // reply = `Got "done" from ${senderName} but couldn't map to player list. Please type: "Rajeev done"`;
     }
   }
   if(reply) await sock.sendMessage(groupId,{text:reply});
 });

 cron.schedule('30 15 * * *', async ()=>{
   let groups = await sock.groupFetchAllParticipating();
   for(let id in groups){
     let name = groups[id].subject;
     if(ALLOWED_GROUP_NAMES.some(n=> name.toLowerCase().includes(n.toLowerCase()))){
       await sock.sendMessage(id,{text:getDuesMsg()});
     }
   }
 });
}
startBot();
