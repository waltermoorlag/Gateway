/***********************************************************
 *  Escucho un puerto TCP donde se envia un string         *
 *  Se arma un Json.                                       *
 *  Se invoca a un servico IOT de HCP con el Json armado.  *
 ***********************************************************/
var dgram = require("dgram");
var net = require('net');
var server = dgram.createSocket("udp4");
var request = require('request');
var fs = require('fs');
var util = require('util');
var mongoose = require('mongoose');

var globalReq = require('./models.js').globalReq;
var globalReqRec = require('./models.js').globalReqRec;
var consolalog = require('./models.js').consolalog;
var estadoserver = require('./models.js').estadoserver;
var adicionalInfoConsola = require('./models.js').adicionalInfoConsola;
var Configurador_Ulbo = require('./models.js').configurador_ulbo;

var ajustarDispo = require('./funciones.js').ajustarDispo;
var crcConvert = require('./funciones.js').crcConvert;
var convertBinary = require('./funciones.js').convertBinary;
var decodeInfo = require('./funciones.js').decodeInfo;
var sleep = require('./funciones.js').sleep;
var ajustar = require('./funciones.js').ajustar;
var ajustar2 = require('./funciones.js').ajustar2;
var obtenerStringHora = require('./funciones.js').obtenerStringHora;
var logRespuestas = require('./funciones.js').logRespuestas;

var urlJava = require('./config.js').urlJava;
var port_TCP = require('./config.js').port_TCP;
var port_UDP = require('./config.js').port_UDP;
var escuchaUDP = require('./config.js').escuchaUDP;
var escuchaTCP = require('./config.js').escuchaTCP;
var urlNewJava = require('./config.js').urlNewJava;
var disposTest = require('./config.js').disposTest;
var urlJavaTest = require('./config.js').urlJavaTest;

var intervalTime = 2;
var Name_Db = "NEWMODEL";
var VerConsolePrincipal = false;
var verenconsola = "";
var verenconsola2 = "";
var logueaTXT = true;
var Monitor = [];
var msjError = [];
var listadoPaquetes = [];
var Recibidos = [];
var DispoEnProceso = [];
var RecibidoEnProceso = [];
var DiccioProtocolo = [];
var DiccioPort = [];
var DiccioHora = [];
var grabados = 0;
var CantGrabar = 0;
var intervalProces = false;


mongoose.connect("mongodb://localhost/gate_" + Name_Db, {
	useNewUrlParser: true,
	reconnectTries: 60,
	reconnectInterval: 1000
});

server.on("message", function (data, rinfo) {
	try {
		var str = data.toString();
		if (str.substring(0, 1) === ">") {
			var strList = [str];
			var dispo = str.substring(str.indexOf("$"));
			dispo = dispo.substring(1, dispo.indexOf("*"));
			dispo = ajustarDispo(15, dispo);

		} else {
			var strList = str.split('#');
			var dispositivo = strList[0].split(',');
			var stringHora = obtenerStringHora();
			var dispo = dispositivo[0].trim() === "*TS01" ? dispositivo[1] : "NOLEGIBLE";
		}
		logTXT(dispo, 'Paquete Recibido: ' + stringHora + ' \n' + str + '\n');
		responderDispo(dispo, strList, rinfo, data.toString());
		verenconsola = "ini>" + dispo + "<fin";
		verenconsola2 = "ini>" + str + "<fin";
		if (dispo.trim() !== "NOLEGIBLE") {
			analizarConfiguracion(server, dispo, "UDP", rinfo);
			if (Recibidos.indexOf(dispo) < 0) {
				Recibidos.push(dispo);
				Recibidos[dispo] = [];
			}
			Recibidos[dispo].push(str);
			if (DiccioProtocolo.indexOf(dispo) < 0) {
				DiccioProtocolo.push(dispo);
			}
			DiccioProtocolo[dispo] = "UDP " + (str.indexOf("MSG:") >= 0 ? "NAC" : (str.substring(0, 1) === ">" ? "EST" : "CHI"));
			if (DiccioPort.indexOf(dispo) < 0) {
				DiccioPort.push(dispo);
			}
			DiccioPort[dispo] = rinfo.address + ':' + rinfo.port;
			if (DiccioHora.indexOf(dispo) < 0) {
				DiccioHora.push(dispo);
			}
			DiccioHora[dispo] = obtenerStringHora();
			monitoreo(dispo, true);
		} else {
			procesarBinaryData(data);
		}
	} catch (e) {
		monitorError(e);
	}
});
server.on("listening", function () {
	console.log("Server Escuchando UDP")
});

var analizarConfiguracion = function (client, dispo, protocolo, rinfo) {
	Configurador_Ulbo.findOne({ deviceid: dispo, cambios: "1" }, function (err, conf) {
		if (conf) {
			if (protocolo == 'TCP') {
				client.write(conf.mensaje);
			} else {
				client.send(conf.mensaje, 0, conf.mensaje.length, parseInt(rinfo.port), rinfo.address);
			}
			conf.cambios = "0";
			conf.horaConf = obtenerStringHora();
			conf.historial.push({mensaje: conf.mensaje, horaSend: conf.horaSend, horaConf: conf.horaConf});
			conf.save()
		}
	});
}

var wrapper = function (remoteAddress, socket) {
	return function (data) {
		try {
			var str = data.toString();
			var strList = str.split('#');
			var dispositivo = strList[0].split(',');
			var stringHora = obtenerStringHora();
			var dispo = dispositivo[0].trim() === "*TS01" ? dispositivo[1] : "NOLEGIBLE";
			if (dispo === "NOLEGIBLE") {
				str = convertBinary(str);
			}
			// logTXT(dispo, '\nPaquete Recibido: ' + stringHora + ' \n' + "<--ini-->" + str + "<--fin-->");
			if (dispo !== "NOLEGIBLE") {
				analizarConfiguracion(socket, dispo, "TCP");
				if (Recibidos.indexOf(dispo) < 0) {
					Recibidos.push(dispo);
					Recibidos[dispo] = [];
				}
				Recibidos[dispo].push(str);

				if (DiccioProtocolo.indexOf(dispo) < 0) {
					DiccioProtocolo.push(dispo);
				}
				DiccioProtocolo[dispo] = "TCP";

				if (DiccioPort.indexOf(dispo) < 0) {
					DiccioPort.push(dispo);
				}
				DiccioPort[dispo] = remoteAddress;

				if (DiccioHora.indexOf(dispo) < 0) {
					DiccioHora.push(dispo);
				}
				DiccioHora[dispo] = obtenerStringHora();
				console.log("Sera aca el problema:", dispo);
				monitoreo(dispo, true);
			} else {
				procesarBinaryData(data);
			};
		} catch (e) {
			monitorError(e);
			console.log(e);
		}
	}
}

var net_server = net.createServer(function (socket) {
	socket.on('end', function () { });
	socket.on('connection', function (socket) {
		console.log("Data Connection Socket:", socket);
	});
	socket.on('error', function (error) {
		logTXT("SOCKET_TCP_ERROR", obtenerStringHora() + error.stack);
	});
	socket.on('data', wrapper(socket.remoteAddress + ":" + socket.remotePort, socket));
});

if (escuchaUDP) {
	server.bind(port_UDP);
}
if (escuchaTCP) {
	net_server.listen(port_TCP, '0.0.0.0', function () {
	});
}

function encolarMensaje(device, str, encolar) {
	var pdeviceId = device.deviceid;
	globalReq.update(
		{ deviceid: device.deviceid },
		{
			$push: { listaRequest: { texto: str, valido: encolar } },
			$set: { ultimoMensaje: str }
		},
		function (err) {
			if (!err) {
				DispoEnProceso[pdeviceId] = false;
				if (Monitor.indexOf(pdeviceId) < 0) {
					Monitor.push(pdeviceId);
					Monitor[pdeviceId] = {
						horaRecibido: '',
						horaUltMsj: '',
						listaRequest: 0,
						reintentos: 0,
						listaRec: 0,
						ultMsj: ""
					};
				}
				globalReq.findOne({ deviceid: pdeviceId }, function (err, device) {
					Monitor[device.deviceid].listaRequest = device.listaRequest.length;
					Monitor[device.deviceid].ultMsj = device.ultimoMensaje;
					monitoreo(device.deviceid);
				});
			} else {
				Recibidos[pdeviceId].push(str);
			}
		});
	// device.listaRequest.push({ texto: str, valido: encolar });
	// device.ultimoMensaje = str;
	// var dispo = device.deviceid;
	// device.save(function (err, device) {
	// 	if (!err) {
	// 		Recibidos[dispo].splice(0,1);
	// 		if (Monitor.indexOf(dispo) < 0) {
	// 			Monitor.push(dispo);
	// 			Monitor[dispo] = {
	// 				horaRecibido: '',
	// 				horaUltMsj: '',
	// 				listaRequest: 0,
	// 				reintentos: 0,
	// 				listaRec: 0,
	// 				ultMsj: ""
	// 			};
	// 		}
	// 		Monitor[device.deviceid].listaRequest = device.listaRequest.length;
	// 		Monitor[device.deviceid].ultMsj = device.ultimoMensaje;
	// 		monitoreo(device.deviceid);
	// 	}
	// });
}

function ubicarDevice(deviceID, str, CantdeMsj) {
	if (DispoEnProceso.indexOf(deviceID) < 0) {
		DispoEnProceso.push(deviceID);
	} else {
		if(DispoEnProceso[deviceID]){
			return;
		}
	}
	DispoEnProceso[deviceID] = true;
	globalReq.findOne({ deviceid: deviceID }, function (err, device) {
		var stringHora = obtenerStringHora();
		if (!device) {
			globalReq.create({
				deviceid: deviceID,
				listaRequest: [],
				reintentos: 0,
				ultimoMensaje: ""
			}, function (err, device) {
				encolarMensaje(device, str, true)
			});
		} else {
			var encolar = true;
			if (device.ultimoMensaje === str) {
				encolar = false;
			};
			encolarMensaje(device, str, encolar)
		}
	});
};

function responderDispo(dispo, arrMsj, rinfo, totalMsj) {
	if (arrMsj.length > 0 && (arrMsj[0].indexOf("STT:") >= 0 || arrMsj[0].indexOf("TRP:") >= 0)) {
		var commandBytes = crcConvert(totalMsj);
		commandBytes = "*TS01,ACK:" + commandBytes + "#";
		server.send(new Buffer(commandBytes), 0, commandBytes.length, rinfo.port, rinfo.address)
		if(logRespuestas){
			logTXT(dispo, 'Respuesta a : ' + rinfo.address + ':' + rinfo.port + ' ' + commandBytes + '\n');
		}
	} else {
		for (var i = 0; i < arrMsj.length - 1; i++) {
			var str = arrMsj[i];
			if (str.substring(0, 1) === ">") {   // DISPOS NACIONALES CON FORMATO ESTANDAR
				var _crc = str.substring(str.indexOf("*"));
				var commandBytes = _crc.substring(1, _crc.indexOf("<"));
				commandBytes = ">XAK" + commandBytes + ";#C01<";
				server.send(new Buffer(commandBytes), 0, commandBytes.length, rinfo.port, rinfo.address)
				if(logRespuestas){
					logTXT(dispo, 'Respuesta a : ' + rinfo.address + ':' + rinfo.port + ' ' + commandBytes + '\n');
				}
			}
			else {
				if (str.indexOf("MSG:") >= 0) {  // DISPOS NACIONALES CON FORMATO ULBO
					var commandBytes = str.substring(str.indexOf("MSG:") + 4, str.indexOf("MSG:") + 10);
					commandBytes = ">TAK" + commandBytes + "<";
					server.send(new Buffer(commandBytes), 0, commandBytes.length, rinfo.port, rinfo.address)
					if(logRespuestas){
						logTXT(dispo, 'Respuesta a : ' + rinfo.address + ':' + rinfo.port + ' ' + commandBytes + '\n');
					}

				} else {  // DISPOS ULBOS
					var commandBytes = crcConvert(str);
					commandBytes = "*TS01,ACK:" + commandBytes + "#";
					server.send(new Buffer(commandBytes), 0, commandBytes.length, rinfo.port, rinfo.address)
					if(logRespuestas){
						logTXT(dispo, 'Respuesta a : ' + rinfo.address + ':' + rinfo.port + ' ' + commandBytes + '\n');
					}
				}
			}
		}
	}
}

function procesarBinaryData(data) {
	var bindata = data.toString('binary');
	var hexdata = new Buffer(bindata, 'ascii').toString('hex');
	str = hexdata.toUpperCase();
	var aux = str;
	str = decodeInfo(str);
	var stringHora = obtenerStringHora();
	if (str !== "ERROR") {
		monitorAdicionalInfo(str.split(",")[1], stringHora, str);
		request({
			timeout: 60000,
			url: urlJava,
			method: 'POST',
			form: { 'adic_info': str }
		}, function (error, response, body) {
			if (!error && response.statusCode == 200) {
			} else {
				logTXT("ADICIONAL_INFO_ERR", 'ERROR!!! : ' + stringHora + ' \n' + '\n' + error + ' \n');
			}
		});
	} else {
		monitorAdicionalInfo("MsjNoIdentificado", stringHora, aux);
	}
}


function monitorAdicionalInfo(pdevice, phoraUltMsj, msj) {
	adicionalInfoConsola.findOne({ deviceid: pdevice }, function (err, device) {
		if (!device) {
			adicionalInfoConsola.create({
				deviceid: pdevice || "DEVICE_ERROR",
				horaUltMsj: phoraUltMsj,
				ultMsj: msj
			}, function (err, device) {
			});
		} else {
			device.horaUltMsj = phoraUltMsj;
			device.ultMsj = msj,
				device.save();
		}
	});
};



function informarHora() {
	var dateNow = new Date();
	estadoserver.findOne({}, function (err, estado) {
		if (!estado) {
			estadoserver.create({
				horaUltMsj: dateNow,
				titulo: "Linux TCP:" + port_TCP.toString() + " y UDP:" + port_UDP.toString()
			}, function (err, device) {
			});

		} else {
			estado.horaUltMsj = dateNow;
			estado.titulo = "Linux TCP:" + port_TCP.toString() + " y UDP:" + port_UDP.toString();
			estado.save();
		}
	});

}

function monitorLog(pdevice, phoraUltMsj, plistaRequest, plistaRec, preintentos, pcolor, pultMsj, vieneDeRecibe) {
	consolalog.findOne({ deviceid: pdevice }, function (err, device) {
		if (!device) {
			consolalog.create({
				deviceid: pdevice,
				// horaUltMsj: phoraUltMsj,
				ultMsj: pultMsj,
				horaRecibido: DiccioHora[pdevice] || "",
				listaRequest: plistaRequest,
				listaReceptora: plistaRec,
				// reintentos: preintentos,
				protocolo: DiccioProtocolo[pdevice] || "",
				ipDevice: DiccioPort[pdevice] || "",
				color: pcolor
			}, function (err, device) {
			});
		} else {
			// device.horaUltMsj = phoraUltMsj.trim().length !== 0 ? phoraUltMsj : device.horaUltMsj;
			device.ultMsj = pultMsj;
			device.listaRequest = (!vieneDeRecibe ? plistaRequest : device.listaRequest);
			device.listaReceptora = plistaRec;
			// device.reintentos = preintentos;
			device.horaRecibido = DiccioHora[pdevice] || device.horaRecibido;
			device.protocolo = DiccioProtocolo[pdevice] || device.protocolo;
			device.ipDevice = DiccioPort[pdevice] || device.ipDevice;
			device.color = pcolor;
			device.save();
		}
	});
}

function monitoreo(deviceId, vieneDeRecibe) {
	var color = '';
	var colorConsole = '';
	// for (var i = 0; i < Monitor.length; i++) {
	if (Monitor.indexOf(deviceId) >= 0) {
		Monitor[deviceId].listaRec = (Recibidos.indexOf(deviceId) < 0) ? 0 : Recibidos[deviceId].length;
		if (Monitor[deviceId].listaRequest > 4 || Monitor[deviceId].listaRec > 4 || Monitor[deviceId].reintentos > 0) {
			color = 'red';
			colorConsole = 'red';
			// Monitor[deviceId].listaRec >= 1 || Monitor[deviceId].reintentos >= 1
		} else if (Monitor[deviceId].listaRequest >= 1) {
			color = 'green';
			colorConsole = 'green';
		} else {
			color = 'white';
			colorConsole = '';
		}
		monitorLog(deviceId, Monitor[deviceId].horaUltMsj, Monitor[deviceId].listaRequest, Monitor[deviceId].listaRec, Monitor[deviceId].reintentos, colorConsole, Monitor[deviceId].ultMsj, vieneDeRecibe);
	}
	// }
};


var logTXT = function (pdev, d) { //
	if (logueaTXT) {
		var dateNow = new Date();
		var dateUTC = new Date(dateNow.getUTCFullYear(), dateNow.getUTCMonth(), dateNow.getUTCDate(), dateNow.getUTCHours(), dateNow.getUTCMinutes(), dateNow.getUTCSeconds())
		var tz = -3;
		var seconds = (tz * 60 * 60) * 1000;
		dateUTC.setTime(dateUTC.getTime() + seconds);
		var fechayhora = dateUTC;
		var stringHora = "" + fechayhora.getFullYear() + ajustar(2, (fechayhora.getMonth() + 1));
		if(fechayhora.getDate() <= 10) {
			stringHora +=  "_1";  
		}
		if(fechayhora.getDate() > 10 && fechayhora.getDate() <= 20) {
			stringHora +=  "_2";  
		}
		if(fechayhora.getDate() > 20) {
			stringHora +=  "_3";  
		}		
		// stringHora += fechayhora.getDate() <= 15 ? "_1" : "_2";
		var nameFile = __dirname + '/logs/log_' + pdev + '_Mes_' + stringHora + '.log'
		fs.appendFile(nameFile, (util.format(d) + '\n'), function (err) {
			if (err)
				throw err;
		})
	}
};

setInterval(function () {
	informarHora();
	procesarRecibidos();
	// monitoreo();
}, intervalTime * 1000);

var procesarRecibidos = function () {
	if (!intervalProces) {
		intervalProces = true;

		for (var i = 0; i < Recibidos.length; i++) {
			if (Recibidos[i].length > 0) {
				var dispo = Recibidos[i];
				iniArreglos(dispo);
				var strMsj = "";
				var msjant = "";
				for (var j = 0; j < Recibidos[dispo].length; j++) {
					if (msjant !== Recibidos[dispo][j]) {
						strMsj += Recibidos[dispo][j];
					}
					msjant = Recibidos[dispo][j];
				}
				var tempNumber = strMsj.split('#');
				Recibidos[dispo] = [];
				if (strMsj.length > 0 && tempNumber.length > 1) {
					ubicarDevice(dispo, strMsj, tempNumber.length - 1);
				}
			}
		}
		intervalProces = false;
	}
}


var iniArreglos = function (dispo) {
	if (DispoEnProceso.indexOf(dispo) < 0) {
		DispoEnProceso.push(dispo);
		DispoEnProceso[dispo] = false;
	}
	if (RecibidoEnProceso.indexOf(dispo) < 0) {
		RecibidoEnProceso.push(dispo);
		RecibidoEnProceso[dispo] = false;
	}
	if (Recibidos.indexOf(dispo) < 0) {
		Recibidos.push(dispo);
		Recibidos[dispo] = [];
	}
}

function monitorError(perror) {
	estadoserver.findOne({}, function (err, estado) {
		if (!estado) {
			estadoserver.create({
				error: perror
			}, function (err, device) {
			});

		} else {
			estado.error = perror;
			estado.save();
		}
	});
}

