const firebaseConfig = {
  apiKey: "AIzaSyBaObSQWm_eQTW7dY9a_X3-0CMs7wh234g",
  authDomain: "booking-a83c7.firebaseapp.com",
  projectId: "booking-a83c7",
  storageBucket: "booking-a83c7.firebasestorage.app",
  messagingSenderId: "152509227195",
  appId: "1:152509227195:web:bef9bd33bd5e93002ac99e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const bookingStart = new Date("2025-05-09T09:00:00");
const bookingEnd =   new Date("2025-05-09T12:00:00");
const bookingStatus = document.getElementById("bookingStatus");
const submitButton = document.getElementById("submitBtn");
const statusIcon = document.getElementById("statusIcon");

async function getServerTime() {
  await db.collection("serverTime").doc("now").set({ ts: firebase.firestore.FieldValue.serverTimestamp() });
  const doc = await db.collection("serverTime").doc("now").get();
  return doc.exists ? doc.data().ts.toDate() : new Date();
}

function formatCountdown(diff) {
  const d = Math.floor(diff / (1000 * 60 * 60 * 24));
  const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const m = Math.floor((diff / (1000 * 60)) % 60);
  const s = Math.floor((diff / 1000) % 60);
  return `${d}ي ${h}س ${m}د ${s}ث`;
}

/*async function updateBookingStatus() {
  const now = await getServerTime();

  if (now < bookingStart) {
    const diff = bookingStart - now;
    bookingStatus.innerText = `لم يبدأ الحجز بعد. يبدأ خلال ${formatCountdown(diff)}`;
    statusIcon.innerText = "⏳";
  } else if (now > bookingEnd) {
    bookingStatus.innerText = "انتهى وقت الحجز.";
    statusIcon.innerText = "⛔";
  } else {
    const diff = bookingEnd - now;
    bookingStatus.innerText = `الحجز مفتوح! ينتهي خلال ${formatCountdown(diff)}`;
    statusIcon.innerText = "⏰";
  }
}
setInterval(updateBookingStatus, 600000);
updateBookingStatus();*/

async function checkDuplicate(phone, id, area) {
  const phoneSnapshot = await db.collection("bookings")
    .where("area", "==", area)
    .where("phone", "==", phone)
    .get();

  if (!phoneSnapshot.empty) return { duplicated: true, field: "phone" };

  const idSnapshot = await db.collection("bookings")
    .where("area", "==", area)
    .where("id", "==", id)
    .get();

  if (!idSnapshot.empty) return { duplicated: true, field: "id" };

  return { duplicated: false };
}

async function getNextSerial(area) {
  const counterRef = db.collection("counters").doc(area);
  return await db.runTransaction(async (transaction) => {
    const doc = await transaction.get(counterRef);
    let current = doc.exists ? doc.data().value || 0 : 0;
    const next = current + 1;
    transaction.set(counterRef, { value: next });
    return next;
  });
}

function validateEgyptianID(id) {
  //التأكد من أن الرقم القومي يتكون من 14 رقم
  if (!/^\d{14}$/.test(id)) return false;
//التأكد من أن الرقم القومي يبدأ برقم 2 أو 3
  const firstDigit = parseInt(id[0]);
  if (firstDigit !== 2 && firstDigit !== 3) return false;
//التأكد من رقم صحيح للسنة
  const secondAndThirdDigits = parseInt(id.slice(1, 3));
  if (secondAndThirdDigits < 0 || secondAndThirdDigits > 99) return false;
//التأكد من أن الشهر صحيح
  const month = parseInt(id.slice(3, 5));
  if (month < 1 || month > 12) return false;
//
  const day = parseInt(id.slice(5, 7));
  if ([1, 3, 5, 7, 8, 10, 12].includes(month) && (day < 1 || day > 31)) return false;
  if ([4, 6, 9, 11].includes(month) && (day < 1 || day > 30)) return false;
//التأكد من أن اليوم في الشهر صحيح
  if (month === 2) {
    const year = parseInt(id.slice(1, 3));
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (isLeapYear && (day < 1 || day > 29)) return false;
    if (!isLeapYear && (day < 1 || day > 28)) return false;
  }
  //التأكد من كود المحافظة
  const eighthAndNinthDigits = parseInt(id.slice(7, 9));
  const validCodes = [
    1, 2, 3, 4,
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 23, 24, 25, 26, 27, 28, 29,
    31, 32, 33, 34, 35,
    88
  ];
  if (!validCodes.includes(eighthAndNinthDigits)) return false;
  //التأكد من ان تاريخ الميلاد ليس في المستقبل
  // التأكد من أن الرقم القومي لا يقل عن 16 سنة
     const birthYear = parseInt(id.slice(1, 3), 10) + (id[0] === '2' ? 1900 : 2000);
     const birthMonth = parseInt(id.slice(3, 5), 10) - 1;
     const birthDay = parseInt(id.slice(5, 7), 10);
     const birthDate = new Date(birthYear, birthMonth, birthDay);
     const today = new Date();
     const age = today.getFullYear() - birthDate.getFullYear() - (today < new Date(today.getFullYear(), birthMonth, birthDay) ? 1 : 0);
     if (birthDate > today || age < 15) return false;
  
  return true;
}

document.getElementById("submitBtn").addEventListener("click", async function (e) {
  e.preventDefault();
  const form = document.getElementById("index");
  if (!form.checkValidity()) {
  form.reportValidity();
  return;
  }
  submitButton.disabled = true;

  try {
    document.getElementById("btnText").innerText = "جارٍ الحجز...";
    document.getElementById("loader").style.display = "inline-block";
    const now = await getServerTime();
    const devicetime = new Date();
    // حساب الفرق بين التوقيتين
    const timeDifference = Math.abs(now.getTime() - devicetime.getTime());
    // إذا كان الفرق أقل من 300,000 ميلي ثانية (اقل من 5 دقايق)، اعتبر الوقت متساويًا
    if (timeDifference > 300000)return alert("تأكد من ضبط الوقت على جهازك بشكل صحيح.");
    if (now < bookingStart) return alert("لم يبدأ الحجز بعد.");
    if (now > bookingEnd) return alert("انتهى وقت الحجز.");
   

    const name = document.getElementById("fullName").value;
    const meeting = document.getElementById("meeting").value;
    const phone = document.getElementById("phoneNumber").value;
    const id = document.getElementById("nationalId").value;
    const area = document.getElementById("bookingArea").value;

    if (!validateEgyptianID(id)) return alert("الرقم القومي غير صالح.");
    const phoneRegex = /^01[0125]\d{8}$/;
    if (!phoneRegex.test(phone)) return alert("رقم الهاتف غير صالح.");

    const duplicateCheck = await checkDuplicate(phone, id, area);
    if (duplicateCheck.duplicated) {
      return alert(duplicateCheck.field === "phone"
        ? "رقم الهاتف مستخدم مسبقاً في هذه المنطقة."
        : "الرقم القومي مستخدم مسبقاً في هذه المنطقة.");
    }

    const serial = await getNextSerial(area);
    await db.collection("bookings").add({
      name, meeting, phone, id, area, serial,
      date: firebase.firestore.FieldValue.serverTimestamp()
    });
    const daysArabic = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const dayName = daysArabic[now.getDay()];
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const period = hours >= 12 ? 'مساءً' : 'صباحًا';
    const formattedHour = hours % 12 || 12; // تحويل 0 إلى 12
    const dateFormatted = `${dayName} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()} - ${formattedHour}:${minutes} ${period}`;
        const confirmation = `
  <div class="confirmation-box">
    <div class="detail-row"><span class="detail-label">الاسم:</span><span class="detail-value">${name}</span></div>
    <div class="detail-row"><span class="detail-label">الاجتماع:</span><span class="detail-value">${meeting}</span></div>
    <div class="detail-row"><span class="detail-label">رقم الهاتف:</span><span class="detail-value">${phone}</span></div>
    <div class="detail-row"><span class="detail-label">الرقم القومي:</span><span class="detail-value">${id}</span></div>
    <div class="detail-row"><span class="detail-label">المنطقة:</span><span class="detail-value">${area}</span></div>
    <div class="detail-row"><span class="detail-label">رقم الحجز:</span><span class="detail-value">${serial}</span></div>
    <div class="detail-row"><span class="detail-label">التاريخ:</span><span class="detail-value">${dateFormatted}</span></div>
  </div>
`;
document.getElementById("confirmationDetails").innerHTML = confirmation;
document.getElementById("confirmation").style.display = "block";

  } catch (err) {
    alert("حدث خطأ. حاول مرة أخرى.");
    console.error(err);
  } finally {
    submitButton.disabled = false;
    document.getElementById("btnText").innerText = "حجز";
    document.getElementById("loader").style.display = "none";
  }
});

function saveAsImage() {
  const confirmationElement = document.getElementById("confirmation");

  html2canvas(confirmationElement, {
    backgroundColor: "#ffffff",
    scale: 2, // لزيادة الدقة
    useCORS: true,
    onclone: function (clonedDoc) {
      const el = clonedDoc.getElementById("confirmation");

      // تأكد من نسخ جميع الأنماط الضرورية
      el.style.color = "#000";
      el.style.backgroundColor = "#fff";
      el.style.padding = "2rem";
      el.style.fontFamily = "Arial, sans-serif";
      el.style.textAlign = "right";
      el.style.direction = "rtl";
      el.style.borderRadius = "12px";
      el.style.boxShadow = "0 0 12px rgba(0,0,0,0.7)";
    }
  }).then(canvas => {
    const link = document.createElement("a");
    link.download = "confirmation.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}
