const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./serviceAccountKey.json")), // حط ملفك في نفس المجلد
  });
}

const db = admin.firestore();

// المواعيد من السيرفر
const bookingStart = new Date("2025-05-01T08:00:00");
const bookingEnd = new Date("2025-05-07T23:59:59");

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

// التحقق من التكرار داخل نفس المنطقة
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

exports.handler = async function(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    };
  }

  try {
    const { name, meeting, phone, id, area } = JSON.parse(event.body);

    const now = new Date();

    if (now < bookingStart) {
      return { statusCode: 403, body: JSON.stringify({ error: "الحجز لم يبدأ بعد." }) };
    }

    if (now > bookingEnd) {
      return { statusCode: 403, body: JSON.stringify({ error: "انتهى وقت الحجز." }) };
    }

    if (!validateEgyptianID(id)) {
      return { statusCode: 400, body: JSON.stringify({ error: "الرقم القومي غير صالح." }) };
    }

    const phoneRegex = /^01[0125]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      return { statusCode: 400, body: JSON.stringify({ error: "رقم الهاتف غير صالح." }) };
    }

    const duplicateCheck = await checkDuplicate(phone, id, area);
    if (duplicateCheck.duplicated) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: `${duplicateCheck.field === "phone" ? "رقم الهاتف" : "الرقم القومي"} مستخدم مسبقاً في هذه المنطقة.` })
      };
    }

    const serial = await getNextSerial(area);

    await db.collection("bookings").add({
      name,
      meeting,
      phone,
      id,
      area,
      serial,
      date: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, serial })
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "حدث خطأ في السيرفر." })
    };
  }
};
