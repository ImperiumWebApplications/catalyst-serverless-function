const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

async function updateCreatorRecord(accessToken, creatorRecId, refreshToken) {
  const baseURL = `https://creator.zoho.in/api/v2.1/senthuraa/microservices/report/zoho_books_authorization_report`;

  try {
    // Update the record in Zoho Creator directly using creator_rec_id
    const updateRecordUrl = `${baseURL}/${creatorRecId}`; // Adjust URL as needed
    await axios.patch(
      updateRecordUrl,
      {
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
        },
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.info("Zoho Creator record updated successfully");
  } catch (error) {
    console.error(
      "Error updating record in Zoho Creator:",
      error.response ? error.response.data : error.message
    );
    throw error; // Propagate the error to handle it accordingly
  }
}

module.exports = async (context, basicIO) => {
  let access_token;
  let refresh_token;
  try {
    const code = basicIO.getArgument("code");
    const stateBase64 = basicIO.getArgument("state");

    if (!code) {
      throw new Error("Code parameter is missing in the request");
    }

    const decodedState = Buffer.from(stateBase64, "base64").toString("utf-8");
    const stateJSON = JSON.parse(decodedState);
    console.info("stateJSON", stateJSON);

    const clientId = process.env.CLIENT_ID;
    const clientSecret = process.env.CLIENT_SECRET;
    const redirectUri = process.env.REDIRECT_URI;
    const grantType = "authorization_code";

    const oauthUrl = `https://accounts.zoho.in/oauth/v2/token?code=${encodeURIComponent(
      code
    )}&client_id=${encodeURIComponent(
      clientId
    )}&client_secret=${encodeURIComponent(
      clientSecret
    )}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&grant_type=${encodeURIComponent(grantType)}`;

    const oauthResponse = await axios.post(oauthUrl);
    console.log("oauthResponse.data", oauthResponse.data);
    if (!oauthResponse.data.access_token) {
      throw new Error(`Expected tokens not found in the response.`);
    }

    access_token = oauthResponse.data.access_token;
    refresh_token = oauthResponse.data.refresh_token;

    // First, update the entry inside Zoho Creator
    await updateCreatorRecord(
      access_token,
      stateJSON.creator_rec_id,
      refresh_token
    );

    // Logic for updating or inserting a new row in the Catalyst Data Store
    const project_id = stateJSON.project_id;
    const tableIdentifier = stateJSON.table_id;
    const apiBase = `https://api.catalyst.zoho.in/baas/v1/project/${project_id}/table/${tableIdentifier}`;

    const getRecordUrl = `${apiBase}/row`;
    const getRecordResponse = await axios.get(getRecordUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`,
        Environment: "Development",
      },
    });

    const existingRow = getRecordResponse.data.data.find(
      (row) => row.ROWID === stateJSON.catalyst_row_id
    );

    if (existingRow) {
      console.info("Updating row in Catalyst Data Store");
      // Update existing row
      const updateRowData = JSON.stringify([
        {
          access_token,
          refresh_token,
          ROWID: stateJSON.catalyst_row_id,
        },
      ]);

      await axios.put(`${apiBase}/row`, updateRowData, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "Content-Type": "application/json",
          Environment: "Development",
        },
      });
    } else {
      console.info("Inserting new row in Catalyst Data Store");
      // Insert new row logic...
      const newRowData = JSON.stringify([
        {
          access_token,
          refresh_token,
          organization_name: "KS", // Include additional fields as required
        },
      ]);

      await axios.post(`${apiBase}/row`, newRowData, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "Content-Type": "application/json",
          Environment: "Development",
        },
      });
    }

    basicIO.write(
      JSON.stringify({
        success: true,
        data: "Operation completed successfully",
      })
    );
  } catch (error) {
    console.error("Error occurred:", error);
    basicIO.write(
      `Error: ${
        error.response ? JSON.stringify(error.response.data) : error.message
      } and access_token is ${access_token}`
    );
  } finally {
    context.close();
  }
};
