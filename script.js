const firebaseConfig = {
  apiKey: "AIzaSyCDCUX4VSL14tgFN_K8yw39fg397tlhe9Y",
  authDomain: "bookingapp-2ab7d.firebaseapp.com",
  projectId: "bookingapp-2ab7d",
  storageBucket: "bookingapp-2ab7d.appspot.com",
  messagingSenderId: "933881469813",
  appId: "1:933881469813:web:6e30ee86c268e09506513c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// إعداد المواعيد
const bookingStart = new Date("2025-05-01T08:00:00");
const bookingEnd = new Date("2025-05-07T23:59:59");

const bookingStatus = document.getElementById("bookingStatus");
const submitButton = document.querySelector("button[type='submit']");
const statusIcon = document.getElementById("statusIcon");

// استخدام توقيت السيرفر بدلاً من جهاز المستخدم
async function getServerTime() {
  const docRef = await db.collection("serverTime").doc("now").set({ ts: firebase.firestore.FieldValue.serverTimestamp() });
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

async function updateBookingStatus() {
  const now = await getServerTime();

  if (now < bookingStart) {
    const diff = bookingStart - now;
    bookingStatus.innerText = `لم يبدأ الحجز بعد. يبدأ خلال ${formatCountdown(diff)}`;
    statusIcon.innerText = "⏳";
    submitButton.disabled = true;
  } else if (now > bookingEnd) {
    bookingStatus.innerText = "⛔ انتهى وقت الحجز.";
    statusIcon.innerText = "⛔";
    submitButton.disabled = true;
  } else {
    const diff = bookingEnd - now;
    bookingStatus.innerText = `الحجز مفتوح! ينتهي خلال ${formatCountdown(diff)}`;
    statusIcon.innerText = "⏰";
    submitButton.disabled = false;
  }
}

setInterval(updateBookingStatus, 10000);
updateBookingStatus();


// ✅ التحقق من التكرار داخل نفس المنطقة فقط
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

// الترقيم المتسلسل لكل منطقة
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

// التحقق من الرقم القومي المصري
function validateEgyptianID(id) {
  if (!/^\d{14}$/.test(id)) return false;

  const firstDigit = parseInt(id[0]);
  if (firstDigit !== 2 && firstDigit !== 3) return false;

  const secondAndThirdDigits = parseInt(id.slice(1, 3));
  if (secondAndThirdDigits < 0 || secondAndThirdDigits > 99) return false;

  const month = parseInt(id.slice(3, 5));
  if (month < 1 || month > 12) return false;

  const day = parseInt(id.slice(5, 7));

  if ([1, 3, 5, 7, 8, 10, 12].includes(month) && (day < 1 || day > 31)) return false;
  if ([4, 6, 9, 11].includes(month) && (day < 1 || day > 30)) return false;

  if (month === 2) {
    const year = parseInt(id.slice(1, 3));
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (isLeapYear && (day < 1 || day > 29)) return false;
    if (!isLeapYear && (day < 1 || day > 28)) return false;
  }

  const eighthAndNinthDigits = parseInt(id.slice(7, 9));
  if (
    (eighthAndNinthDigits < 1 || eighthAndNinthDigits > 4) &&
    (eighthAndNinthDigits < 11 || eighthAndNinthDigits > 35) &&
    eighthAndNinthDigits !== 88
  ) return false;

  return true;
}

// عند إرسال النموذج
document.getElementById("index").addEventListener("submit", async function (e) {
  e.preventDefault();

  const now = await getServerTime();
  if (now < bookingStart) return alert("لم يبدأ الحجز بعد.");
  if (now > bookingEnd) return alert("انتهى وقت الحجز.");

  const name = document.getElementById("fullName").value;
  const meeting = document.getElementById("meeting").value;
  const phone = document.getElementById("phoneNumber").value;
  const id = document.getElementById("nationalId").value;
  const area = document.getElementById("bookingArea").value;

  // ✅ التحقق من صحة الرقم القومي
  if (!validateEgyptianID(id)) {
    return alert("الرقم القومي غير صالح. تأكد منه واعد المحاولة.");
  }

  // ✅ التحقق من صحة رقم الهاتف
  const phoneRegex = /^01[0125]\d{8}$/;
  if (!phoneRegex.test(phone)) {
    return alert("رقم الهاتف غير صالح. يجب أن يبدأ بـ 010 أو 011 أو 012 أو 015 ويتكون من 11 رقمًا.");
  }

  // ✅ التحقق من التكرار داخل نفس المنطقة
  const duplicateCheck = await checkDuplicate(phone, id, area);
  if (duplicateCheck.duplicated) {
    if (duplicateCheck.field === "phone") {
      return alert("رقم الهاتف مستخدم مسبقاً في هذه المنطقة.");
    } else if (duplicateCheck.field === "id") {
      return alert("الرقم القومي مستخدم مسبقاً في هذه المنطقة.");
    }
  }

  let serial;
  try {
    serial = await getNextSerial(area);
  } catch (err) {
    alert("حدث خطأ في إنشاء رقم الحجز.");
    console.error(err);
    return;
  }

  await db.collection("bookings").add({
    name,
    meeting,
    phone,
    id,
    area,
    serial,
    date: firebase.firestore.FieldValue.serverTimestamp()
  });

  const confirmation = `
    الاسم: ${name}<br>
    الاجتماع: ${meeting}<br>
    رقم الهاتف: ${phone}<br>
    الرقم القومي: ${id}<br>
    المنطقة: ${area}<br>
    رقم الحجز: ${serial}<br>
    التاريخ: ${now.toLocaleString()}
  `;
  document.getElementById("confirmationDetails").innerHTML = confirmation;
  document.getElementById("confirmation").style.display = "block";
});

// حفظ كصورة
function saveAsImage() {
  html2canvas(document.getElementById("confirmation"), {
    backgroundColor: "#FFFFFF",
    onclone: function (document) {
      const confirmationElement = document.getElementById("confirmation");
      confirmationElement.style.color = "#000000";
    }
  }).then(canvas => {
    const link = document.createElement("a");
    link.download = "confirmation.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}
