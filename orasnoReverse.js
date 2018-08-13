const { json, createError } = require("micro");
const { Pool } = require("pg");
const yup = require("yup");

const pool = new Pool();

async function getOrganization(id) {
  const res = await pool.query(
    `
  	SELECT *
  	FROM organizations
  	WHERE id = $1
  `,
    [id]
  );
  return res.rows[0];
}

async function getInterview(applicantId) {
  const res = await pool.query(
    `
  	SELECT *
  	FROM interviews
  	WHERE applicant_id = $1
  `,
    [applicantId]
  );
  return res.rows[0];
}

function generatePin(existingPins) {
  const pin = Math.random()
    .toString()
    .substr(2, 4);
  // pins must be unique in the DB
  if (existingPins.includes(pin)) {
    return generatePin(existingPins);
  }
  return pin;
}

async function createInterview(phoneNumberId, applicantId) {
  const concurrentInterviews = await pool.query(
    `
	SELECT pin
	FROM interviews
	WHERE organization_id = $1;
  `,
    [phoneNumberId]
  );
  const existingPins = concurrentInterviews.rows.map(row => row.pin);
  const pin = generatePin(existingPins);

  const res = await pool.query(
    `
	INSERT INTO interviews (created_at, updated_at, phone_number_id, pin, applicant_id)
	VALUES (NOW(), NOW(), $1, $2, $3)
	RETURNING *;
  `,
    [phoneNumberId, pin, applicantId]
  );
  return res.rows[0];
}

const schema = yup.object().shape({
  organizationId: yup.number().required(),
  applicantId: yup.required()
});

async function parseRequest(request) {
  const body = await json(request);

  try {
    return schema.validate(body);
  } catch {
    throw createError(400, "not found");
  }
}

module.exports = async request => {
  const { organizationId, applicantId } = await parseRequest(request);

  const interview = await getInterview(applicantId);
  const org = await getOrganization(organizationId);

  if (interview) {
    return { pin: interview.pin };
  }

  if (!org) {
    throw createError(400, "not found");
  }

  const newInterview = await createInterview(org.id, applicantId);

  return { pin: newInterview.pin };
};

