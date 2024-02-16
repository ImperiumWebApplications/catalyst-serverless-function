const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

function generateRandomBigInt() {
  const min = 1000000000n;
  const max = 9999999999n;
  const randomBigInt =
    min + BigInt(Math.floor(Number(max - min + 1n) * Math.random())) + min;
  return randomBigInt;
}

async function createEntryInZohoCreator(
  accessToken,
  catalyst_row_id,
  refreshToken
) {
  const creatorApiUrl = `https://creator.zoho.in/api/v2/senthuraa/microservices/form/Zoho_Books_Authorization`;

  const postData = {
    data: {
      zoho_data_center: "148608000000529220",
      access_token: accessToken,
      refresh_token: refreshToken,
      catalyst_row_id: catalyst_row_id,
    },
  };

  try {
    await axios.post(creatorApiUrl, postData, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    console.info("Zoho Creator entry created successfully");
  } catch (error) {
    console.error("Error creating entry in Zoho Creator:", error.response.data);
    throw error; // Propagate the error to handle it accordingly
  }
}

async function updateCreatorRecord(accessToken, catalystRowId, refreshToken) {
  const baseURL = `https://creator.zoho.in/api/v2.1/senthuraa/microservices/report/Zoho_Books_Authorization_Report`;

  try {
    // Fetch all records
    const recordsResponse = await axios.get(baseURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        accept: "application/json",
      },
    });
    console.log("Incoming parameters for updateCreatorRecord", {
      accessToken,
      catalystRowId,
      refreshToken,
    });
    console.log("recordsResponse.data.data", recordsResponse.data.data);
    // Find the matching record by catalyst_row_id
    const record = recordsResponse.data.data.find(
      (record) => record.catalyst_row_id === catalystRowId
    );

    console.log("record found is", record);

    if (!record) {
      throw new Error("Matching record not found.");
    }

    // Update the found record
    const updateRecordUrl = `${baseURL}/${record.ID}`; // Adjust URL as needed
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
    const project_id = stateJSON.project_id;
    const tableIdentifier = stateJSON.table_id;
    const apiBase = `https://api.catalyst.zoho.in/baas/v1/project/${project_id}/table/${tableIdentifier}`;

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
      console.info("Updating row");
      // Update existing row
      const updateRowData = JSON.stringify([
        {
          access_token, // Assuming stateJSON contains the fields to update
          refresh_token,
          zoho_org_id: generateRandomBigInt().toString(),
          ROWID: stateJSON.catalyst_row_id, // Include the ROWID to identify the row to update
        },
      ]);

      await axios.put(`${apiBase}/row`, updateRowData, {
        headers: {
          Authorization: `Zoho-oauthtoken ${access_token}`,
          "Content-Type": "application/json",
          Environment: "Development",
        },
      });
      await updateCreatorRecord(
        access_token,
        stateJSON.catalyst_row_id,
        refresh_token
      );
    } else {
      console.info("Inserting new row");
      // Insert new row logic...
      const newRowData = JSON.stringify([
        {
          access_token,
          refresh_token,
          zoho_org_id: generateRandomBigInt().toString(),
          organization_name: "KS",
          // Include additional fields as required
        },
      ]);

      const newRowDataResponse = await axios.post(
        `${apiBase}/row`,
        newRowData,
        {
          headers: {
            Authorization: `Zoho-oauthtoken ${access_token}`,
            "Content-Type": "application/json",
            Environment: "Development",
          },
        }
      );

      // Create an entry in Zoho Creator after inserting a new row
      await createEntryInZohoCreator(
        access_token,
        newRowDataResponse.data.data[0].ROWID,
        refresh_token
      );
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
