import * as express from "express";
import config from "../../config/index";
import { logger } from "../../utils/logger";
import { getFinalUpdatedResponse, getModifiedResponse, getNewEntryResponse, getOldEntryResponse, getResponseFromDb, getCreationDetails, getSchemaAndProcessResult } from '../../utils/index'


import {
    getSheetData,
    searchMDMS,
    processCreateData
} from "../../api/index";

import {
    generateResourceMessage,
    // processFile,
    // errorResponder,
    sendResponse,
} from "../../utils/index";
import { getTransformAndParsingTemplates, processValidationWithSchema, validateTransformedData } from "../../utils/validator";
import { httpRequest } from "../../utils/request";
// import { httpRequest } from "../../utils/request";
import { Pool } from 'pg';
import { generateXlsxFromJson } from "../../utils/index"
import { errorResponder } from "../../utils/index";
import { generateAuditDetails } from "../../utils/index";
import { produceModifiedMessages } from "../../Kafka/Listener";
import { callSearchApi } from '../../utils/index'
const updateGeneratedResourceTopic = config.KAFKA_UPDATE_GENERATED_RESOURCE_DETAILS_TOPIC;
const createGeneratedResourceTopic = config.KAFKA_CREATE_GENERATED_RESOURCE_DETAILS_TOPIC;




// Define the MeasurementController class
class genericAPIController {
    // Define class properties
    public path = "/hcm";
    public router = express.Router();
    public dayInMilliSecond = 86400000;

    // Constructor to initialize routes
    constructor() {
        this.intializeRoutes();
    }

    // Initialize routes for MeasurementController
    public intializeRoutes() {
        this.router.post(`${this.path}/_create`, this.createData);
        this.router.post(`${this.path}/_validate`, this.validateData);
        this.router.post(`${this.path}/_download`, this.downloadData);
        this.router.post(`${this.path}/_generate`, this.generateData);
    }
    createData = async (
        request: express.Request,
        response: express.Response
    ) => {
        try {
            const { type } = request?.body?.ResourceDetails;
            const hostHcmBff = config.host.hcmBff.endsWith('/') ? config.host.hcmBff.slice(0, -1) : config.host.hcmBff;
            const result = await httpRequest(`${hostHcmBff}${config.app.contextPath}${'/hcm'}/_validate`, request.body, undefined, undefined, undefined, undefined);
            if (result?.validationResult == "VALID_DATA") {
                const ResponseDetails = await processCreateData(result, type, request, response);
                return sendResponse(response, { ResponseDetails }, request);
            }
            else if (result?.validationResult == "INVALID_DATA") {
                const failedMessage: any = await generateResourceMessage(request.body, "INVALID_DATA")
                produceModifiedMessages(failedMessage, config.KAFKA_CREATE_RESOURCE_DETAILS_TOPIC);
                const ResponseDetails = failedMessage;
                ResponseDetails.error = result?.errors || "Error during validation of data, Check Logs";
                return sendResponse(response, { ResponseDetails }, request);
            }
            else {
                const failedMessage: any = await generateResourceMessage(request.body, "OTHER_ERROR")
                produceModifiedMessages(failedMessage, config.KAFKA_CREATE_RESOURCE_DETAILS_TOPIC);
                const ResponseDetails = failedMessage;
                ResponseDetails.error = "Some other error, Check Logs";
                return sendResponse(response, { ResponseDetails }, request);
            }
        } catch (error: any) {
            logger.error(error);
            return sendResponse(response, { "error": error.message }, request);
        }
    };


    validateData = async (
        request: express.Request,
        response: express.Response
    ) => {
        try {
            const { type, fileStoreId } = request?.body?.ResourceDetails;
            const APIResourceName = type;

            // Search for campaign in MDMS
            const APIResource: any = await searchMDMS([APIResourceName], config.values.APIResource, request.body.RequestInfo, response);
            const { transformTemplate, parsingTemplate } = await getTransformAndParsingTemplates(APIResource, request, response);


            // Search for transform template
            const result: any = await searchMDMS([transformTemplate], config.values.transfromTemplate, request.body.RequestInfo, response);
            const url = config.host.filestore + config.paths.filestore + `/url?tenantId=${request?.body?.RequestInfo?.userInfo?.tenantId}&fileStoreIds=${fileStoreId}`;

            logger.info("File fetching url : " + url);
            let TransformConfig: any;
            if (result?.mdms?.length > 0) {
                TransformConfig = result.mdms[0];
                logger.info("TransformConfig : " + JSON.stringify(TransformConfig));
            }

            // Get data from sheet
            const updatedDatas: any = await getSheetData(url, [{ startRow: 2, endRow: 50 }], TransformConfig?.data?.Fields, TransformConfig?.data?.sheetName);
            if (!Array.isArray(updatedDatas)) {
                throw new Error(JSON.stringify(updatedDatas));
            }
            validateTransformedData(updatedDatas);
            const { processResult, schemaDef } = await getSchemaAndProcessResult(request, parsingTemplate, updatedDatas, APIResource);


            // Validate data with schema
            const validationErrors: any[] = [];
            const validatedData: any[] = [];
            processValidationWithSchema(processResult, validationErrors, validatedData, schemaDef);

            // Include error messages from MDMS service
            const mdmsErrors = processResult?.mdmsErrors || [];

            // Send response
            if (validationErrors.length > 0 || mdmsErrors.length > 0) {
                const errors = [...validationErrors, ...mdmsErrors];
                return sendResponse(response, { "validationResult": "INVALID_DATA", "errors": errors }, request);
            } else {
                const creationDetails = getCreationDetails(APIResource);
                return sendResponse(response, {
                    "validationResult": "VALID_DATA",
                    "data": validatedData,
                    creationDetails
                }, request);
            }
        } catch (error: any) {
            logger.error(error);
            return sendResponse(response, { "validationResult": "ERROR", "errorDetails": error.message }, request);
        }
    };


    generateData = async (request: express.Request, response: express.Response) => {
        try {
            const responseData = await getResponseFromDb(request, response);
            const modifiedResponse = await getModifiedResponse(responseData);
            const newEntryResponse = await getNewEntryResponse(modifiedResponse, request);
            const oldEntryResponse = await getOldEntryResponse(modifiedResponse, request);
            const { forceUpdate, type } = request.query;
            const forceUpdateBool: boolean = forceUpdate === 'true';
            let generatedResource: any;
            let result: any;
            let responseDatas: any;
            let finalResponse: any;
            let generatedResourceNew: any;
            if (forceUpdateBool) {
                if (responseData.length > 0) {
                    generatedResource = { generatedResource: oldEntryResponse }
                    produceModifiedMessages(generatedResource, updateGeneratedResourceTopic);
                    console.log(oldEntryResponse, "olllllllllldddddddd")
                    generatedResource = { generatedResource: newEntryResponse }
                    console.log(newEntryResponse, "newwwwwwwww")
                    produceModifiedMessages(generatedResource, createGeneratedResourceTopic);
                    responseDatas = await callSearchApi(request, response);
                    result = await generateXlsxFromJson(request, response, responseDatas);
                    finalResponse = await getFinalUpdatedResponse(result, newEntryResponse, request);
                    console.log(finalResponse, "finallllllllll")
                    generatedResourceNew = { generatedResource: finalResponse }
                    produceModifiedMessages(generatedResourceNew, updateGeneratedResourceTopic);
                }
                else {
                    generatedResource = { generatedResource: newEntryResponse }
                    produceModifiedMessages(generatedResource, createGeneratedResourceTopic);
                    responseDatas = await callSearchApi(request, response);
                    result = await generateXlsxFromJson(request, response, responseDatas);
                    finalResponse = await getFinalUpdatedResponse(result, newEntryResponse, request);
                    generatedResourceNew = { generatedResource: finalResponse }
                    produceModifiedMessages(generatedResourceNew, updateGeneratedResourceTopic);

                }
            }
            else {
                if (responseData.length == 0) {
                    generatedResource = { generatedResource: newEntryResponse };
                    produceModifiedMessages(generatedResource, createGeneratedResourceTopic);
                    responseDatas = await callSearchApi(request, response);
                    result = await generateXlsxFromJson(request, response, responseDatas);
                    finalResponse = await getFinalUpdatedResponse(result, newEntryResponse, request);
                    generatedResourceNew = { generatedResource: finalResponse }
                    produceModifiedMessages(generatedResourceNew, updateGeneratedResourceTopic);
                }
            }
            return sendResponse(response, { ResponseDetails: { type: type, status: 'Table up to date' } }, request);

        } catch (e: any) {
            logger.error(String(e))
            return errorResponder({ message: String(e) }, request, response);
        }
    };

    downloadData = async (request: express.Request, response: express.Response) => {
        try {
            const type = request.query.type;
            const pool = new Pool({
                user: config.DB_USER,
                host: config.DB_HOST,
                database: config.DB_NAME,
                password: config.DB_PASSWORD,
                port: parseInt(config.DB_PORT)
            });
            let queryString = "SELECT * FROM eg_generated_resource_details WHERE type = $1";
            logger.info("queryString : " + queryString)
            const queryResult = await pool.query(queryString, [type]);
            logger.info("queryResult : " + JSON.stringify(queryResult.rows))
            // response.json(queryResult.rows);
            const responseData = queryResult.rows;
            await pool.end();
            if (responseData.length > 0) {
                let result = [];
                result = await generateXlsxFromJson(request, response, responseData);
                const auditDetails = await generateAuditDetails(request);
                const transformedResponse = result.map((item: any) => {
                    return {
                        fileStoreId: item.fileStoreId,
                        additionalDetails: {},
                        type: type,
                        url: config.host.filestore + config.paths.filestore + "?" + type,
                        auditDetails: auditDetails // Use the generated audit details for each item
                    };
                });
                return sendResponse(response, { fileStoreIds: transformedResponse }, request);
            }
            else {
                return errorResponder({ message: "No data present of  given type " + "    Check Logs" }, request, response);
            }
        } catch (e: any) {
            logger.error(String(e));
            return errorResponder({ message: String(e) + "    Check Logs" }, request, response);
        }
    };
}
// Export the MeasurementController class
export default genericAPIController;

